// Piles: how each item lies when there is more than one. Logs stack in a pyramid on their sides; boards lie in
// layers on stickers; stone, fruit and ore chunks are dropped one at a time onto a height map and settle where they
// land (a real heap, every chunk resting on the ones under it); loose earth slumps into a lumpy mound with clods on
// it; ingots, bricks and blocks go down in neat layers turned a quarter each time; sacks and bales in a running
// bond; cans and drums stand in rows; parts sit in rows on a pallet; vials stand in a wooden rack. Every pile grows
// with the amount and is merged per material (one draw call a material).
import * as THREE from 'three';
import { Mesher, Rnd, type MatKey } from './mesh';
import { formOf, S, type PileKind } from './forms';

const PI = Math.PI;
// ------------------------------------------------------------------ units (cached, centred, resting on y = 0)
interface Unit { M: Mesher; size: THREE.Vector3 }
const units = new Map<string, Unit>();
/** one unit of an item: variant v, seed slot s (0..2), centred on x/z with its lowest point on y = 0 */
export function unitOf(id: string, v: number, s = 0): Unit {
  const f = formOf(id), vv = ((v % f.variants) + f.variants) % f.variants, k = `${id}|${vv}|${s % 3}`;
  let u = units.get(k);
  if (u) return u;
  const raw = new Mesher();
  f.unit(raw, vv, 11 + vv * 31 + (s % 3) * 7 + id.length * 3);
  const b = raw.bounds(), c = b.getCenter(new THREE.Vector3());
  const M = new Mesher();
  M.at([-c.x, -b.min.y, -c.z], [0, 0, 0], 1, () => M.merge(raw));
  u = { M, size: b.getSize(new THREE.Vector3()) };
  units.set(k, u);
  return u;
}
/** how many units a container stack shows: grows with its share of a full cell */
export function unitsFor(id: string, k: number, cells = 1): number {
  const kind = formOf(id).pile;
  const cap: Record<PileKind, number> = { logs: 6, boards: 8, chunks: 9, mound: 10, stack: 8, bales: 4, cans: 3, crates: 2, packs: 4, rack: 6 };
  return Math.max(1, Math.round(Math.max(0.05, Math.min(1, k)) * cap[kind] * Math.max(1, Math.sqrt(cells))));
}

// ------------------------------------------------------------------ placing
type Place = (M: Mesher, u: Unit, pos: [number, number, number], rot: [number, number, number]) => void;
const put: Place = (M, u, pos, rot) => M.at(pos, rot, 1, () => M.merge(u.M), 'YXZ');
const pickV = (id: string, i: number, seed: number) => Math.floor(new Rnd(seed * 31 + i * 7 + 1).next() * 97);

/** logs on their sides, rows narrowing upward */
function logs(M: Mesher, id: string, n: number, seed: number) {
  const r = new Rnd(seed), u0 = unitOf(id, 0), D = Math.max(u0.size.y, u0.size.z) * 0.98, L = u0.size.x;
  let b = 1; while ((b * (b + 1)) / 2 < n) b++;
  let left = n, row = 0;
  while (left > 0) {
    const c = Math.min(b - row, left);
    for (let i = 0; i < c; i++) {
      const u = unitOf(id, pickV(id, row * 9 + i, seed), (row + i) % 3);
      const z = (i - (c - 1) / 2) * D * 1.02 + r.r(-0.01, 0.01) * D;
      // a log on the row above rests in the groove: centres sit sqrt(3)/2 of a diameter up
      put(M, u, [r.r(-0.06, 0.06) * L, row * D * 0.86 + (u0.size.y - u.size.y) * 0, z], [r.r(-0.3, 0.3) * 0, r.r(-0.05, 0.05), 0]);
    }
    left -= c; row++;
  }
}
/** flat things in layers; timber on stickers */
function boards(M: Mesher, id: string, n: number, seed: number) {
  const r = new Rnd(seed), u0 = unitOf(id, 0), W = u0.size.z, T = u0.size.y, L = u0.size.x;
  const stick = id === 'plank', slab = id === 'rock_slate';
  const per = Math.max(1, Math.min(4, Math.round(Math.sqrt(n) * 0.9)));
  let y = 0, k = 0;
  for (let layer = 0; k < n; layer++) {
    if (stick && layer > 0) { for (const x of [-L * 0.36, L * 0.36]) M.at([x, y + 0.011, 0], [0, 0, 0], 1, () => M.box('wood', 0.03, 0.022, per * W * 1.08)); y += 0.022; }
    const c = Math.min(per, n - k);
    for (let i = 0; i < c; i++, k++) {
      const u = unitOf(id, pickV(id, k, seed), k % 3);
      put(M, u, [r.r(-0.03, 0.03) * L, y, (i - (per - 1) / 2) * W * 1.04], [slab ? r.r(-0.05, 0.05) : 0, slab ? r.r(-0.5, 0.5) : r.r(-0.02, 0.02), slab ? r.r(-0.05, 0.05) : 0]);
    }
    y += T * (slab ? 0.85 : 1.0);
  }
}
/** drop units one by one onto a height map: each rests on whatever is under it (a real heap) */
function heap(M: Mesher, id: string, n: number, seed: number, o: { base?: (x: number, z: number) => number; R?: number; sink?: number } = {}) {
  const r = new Rnd(seed), u0 = unitOf(id, 0);
  const ru = Math.max(u0.size.x, u0.size.z) * 0.5, hu = u0.size.y;
  const R = o.R ?? ru * (0.9 + Math.sqrt(n) * 0.85);
  const G = 40, cell = (R * 2.6) / G, hm = new Float32Array(G * G);
  const gi = (x: number) => Math.max(0, Math.min(G - 1, Math.floor((x + R * 1.3) / cell)));
  const base = o.base ?? (() => 0);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) hm[j * G + i] = base(-R * 1.3 + (i + 0.5) * cell, -R * 1.3 + (j + 0.5) * cell);
  const golden = PI * (3 - Math.sqrt(5));
  for (let k = 0; k < n; k++) {
    const u = unitOf(id, pickV(id, k, seed), k % 3);
    // land near the middle first, then wider; a few roll off to the foot
    const t = n === 1 ? 0 : Math.sqrt((k + 0.5) / n), roll = r.next() < 0.12;
    const rad = (roll ? R * r.r(0.8, 1.05) : R * t * 0.78) * (n <= 3 ? 0.9 : 1), a = k * golden + r.r(-0.3, 0.3);
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad, yaw = r.r(0, PI * 2);
    const fx = u.size.x * 0.32, fz = u.size.z * 0.32;
    let top = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const px = x + (dx * fx * Math.cos(yaw) - dz * fz * Math.sin(yaw)), pz = z + (dx * fx * Math.sin(yaw) + dz * fz * Math.cos(yaw));
      top = Math.max(top, hm[gi(pz) * G + gi(px)]);
    }
    const sink = (o.sink ?? 0.22) * u.size.y, y = Math.max(base(x, z) - sink * 0.5, top - sink);
    const tilt = Math.min(0.45, top * 1.5 / Math.max(0.05, R));
    put(M, u, [x, y, z], [r.r(-tilt, tilt), yaw, r.r(-tilt, tilt)]);
    // raise the map under it
    const rr = Math.max(u.size.x, u.size.z) * 0.5;
    for (let j = gi(z - rr); j <= gi(z + rr); j++) for (let i = gi(x - rr); i <= gi(x + rr); i++) {
      const cx = -R * 1.3 + (i + 0.5) * cell, cz = -R * 1.3 + (j + 0.5) * cell, d = Math.hypot(cx - x, cz - z) / rr;
      if (d > 1) continue;
      hm[j * G + i] = Math.max(hm[j * G + i], y + u.size.y * Math.sqrt(1 - d * d) * 0.95);
    }
  }
  void hu;
}
/** loose material: a slumped mound, clods and stones lying on it */
function mound(M: Mesher, id: string, n: number, seed: number) {
  const f = formOf(id), u0 = unitOf(id, 0), r = new Rnd(seed);
  const s = Math.cbrt(n);
  const R = 0.13 + s * 0.13, Hh = R * (0.48 + Math.min(0.12, n * 0.01));
  M.at([0, 0, 0], [0, r.r(0, PI), 0], 1, () => M.mound(f.heap ?? 'dirt', R, Hh, seed + 3, { rz: R * r.r(0.85, 1), rings: 5, n: 15, lump: 0.1, peak: 1.7 }));
  // the mound's own profile (as Mesher.mound draws it), for sitting things on it
  const prof = (t: number) => Hh * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, t), 1.7)), 0.85) * (0.75 + 0.25 * (1 - t));
  const k = Math.max(1, Math.min(14, Math.round(n * 0.55)));
  heap(M, id, k, seed + 1, { base: (x, z) => prof(Math.hypot(x, z) / R) * 0.96, R: R * 1.02, sink: 0.4 });
  void u0;
}
/** neat layers, each turned a quarter from the one under it */
function stack(M: Mesher, id: string, n: number, seed: number, turn = true) {
  const r = new Rnd(seed), u0 = unitOf(id, 0), lx = u0.size.x * 1.03, ly = u0.size.y, lz = u0.size.z * 1.06;
  const per = n <= 3 ? Math.max(1, n - 1) : Math.max(2, Math.min(6, Math.round(Math.pow(n, 0.62))));
  let k = 0, layer = 0;
  while (k < n) {
    const rot = turn && layer % 2 === 1, c = Math.min(per, n - k);
    // a layer is a row of `per` (short side by side); turned layers run the other way
    for (let i = 0; i < c; i++, k++) {
      const u = unitOf(id, pickV(id, k, seed), k % 3), off = (i - (c - 1) / 2);
      const x = rot ? off * lz * 0 + r.r(-0.01, 0.01) : off * 0 + r.r(-0.01, 0.01), z = off * lz;
      if (rot) put(M, u, [z * 0.98 + x, layer * ly, r.r(-0.01, 0.01)], [0, PI / 2 + r.r(-0.04, 0.04), 0]);
      else put(M, u, [x, layer * ly, z], [0, r.r(-0.04, 0.04), 0]);
    }
    layer++;
  }
  void lx;
}
/** sacks and bales in a running bond, slumped */
function bales(M: Mesher, id: string, n: number, seed: number) {
  const r = new Rnd(seed), u0 = unitOf(id, 0), w = u0.size.x * 0.98, h = u0.size.y * 0.9, d = u0.size.z * 1.02;
  const per = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(n))));
  let k = 0, layer = 0;
  while (k < n) {
    const c = Math.min(layer ? per - 1 || 1 : per, n - k);
    for (let i = 0; i < c; i++, k++) { const u = unitOf(id, pickV(id, k, seed), k % 3); put(M, u, [(i - (c - 1) / 2) * w, layer * h, r.r(-0.03, 0.03) * d], [r.r(-0.05, 0.05), r.r(-0.2, 0.2), r.r(-0.04, 0.04)]); }
    layer++;
  }
}
/** upright containers in rows */
function rows(M: Mesher, id: string, n: number, seed: number, tray = false) {
  const r = new Rnd(seed), u0 = unitOf(id, 0), sx = u0.size.x * 1.08, sy = u0.size.y, sz = u0.size.z * 1.08;
  const nx = Math.max(1, Math.ceil(Math.sqrt(n * (sz / sx)))), per = Math.min(n, nx * Math.max(1, Math.ceil(Math.min(n, 6) / nx)));
  const ny = Math.ceil(per / nx);
  if (tray) { const W = nx * sx + 0.04, D = ny * sz + 0.04; M.at([0, 0.012, 0], [0, 0, 0], 1, () => pallet(M, W, D)); }
  const y0 = tray ? 0.024 : 0;
  for (let k = 0; k < n; k++) {
    const layer = Math.floor(k / per), j = k % per, ix = j % nx, iz = Math.floor(j / nx);
    const u = unitOf(id, pickV(id, k, seed), k % 3);
    put(M, u, [(ix - (nx - 1) / 2) * sx + r.r(-0.008, 0.008), y0 + layer * sy, (iz - (ny - 1) / 2) * sz + r.r(-0.008, 0.008)], [0, r.r(-0.3, 0.3) * (tray ? 0.2 : 1), 0]);
  }
}
/** a low wooden pallet: deck boards on three runners */
function pallet(M: Mesher, W: number, D: number) {
  const nb = Math.max(2, Math.round(D / 0.07));
  for (let i = 0; i < nb; i++) M.at([0, 0.006, (i - (nb - 1) / 2) * (D / nb)], [0, 0, 0], 1, () => M.box('crateWood', W, 0.012, D / nb - 0.008));
  for (const x of [-W * 0.42, 0, W * 0.42]) M.at([x, -0.006, 0], [0, 0, 0], 1, () => M.box(S('ochre', 2), 0.04, 0.012, D));
}
/** vials and eggs standing in a wooden rack */
function rack(M: Mesher, id: string, n: number, seed: number) {
  const u0 = unitOf(id, 0), sx = u0.size.x * 1.25, sz = u0.size.z * 1.25;
  const per = Math.min(5, n), rowsN = Math.ceil(n / per);
  const W = per * sx + 0.03, D = rowsN * sz + 0.02;
  M.at([0, 0.008, 0], [0, 0, 0], 1, () => M.box('wood', W, 0.016, D, 0.003));
  M.at([0, u0.size.y * 0.45, 0], [0, 0, 0], 1, () => M.box(S('ochre', 4), W, 0.012, D, 0.002));
  for (const x of [-W / 2 + 0.008, W / 2 - 0.008]) M.at([x, u0.size.y * 0.23, 0], [0, 0, 0], 1, () => M.box(S('ochre', 3), 0.016, u0.size.y * 0.46, D));
  for (let k = 0; k < n; k++) { const ix = k % per, iz = Math.floor(k / per); put(M, unitOf(id, pickV(id, k, seed), k % 3), [(ix - (per - 1) / 2) * sx, 0.016, (iz - (rowsN - 1) / 2) * sz], [0, new Rnd(seed + k).r(-0.5, 0.5), 0]); }
}

/** what an icon shows: one unit, n units dropped in a heap, or the item's own pile of n */
export function iconMesher(id: string, n: number, seed: number, as?: 'unit' | 'heap' | 'pile'): Mesher {
  const f = formOf(id), k = as ?? (n <= 1 ? 'unit' : f.pile === 'chunks' || f.pile === 'mound' ? 'heap' : 'pile');
  const M = new Mesher();
  if (k === 'unit') M.merge(unitOf(id, 0, seed % 3).M);
  else if (k === 'heap') heap(M, id, n, seed);
  else return pileMesher(id, n, seed);
  return M;
}
/** a pile of n units of an item, centred, resting on y = 0 */
export function pileMesher(id: string, n: number, seed = 1): Mesher {
  const M = new Mesher(), f = formOf(id);
  n = Math.max(1, Math.round(n));
  if (n === 1 && f.pile !== 'mound' && f.pile !== 'rack') { M.merge(unitOf(id, 0, seed % 3).M); return M; }
  switch (f.pile) {
    case 'logs': logs(M, id, n, seed); break;
    case 'boards': boards(M, id, n, seed); break;
    case 'chunks': heap(M, id, n, seed); break;
    case 'mound': mound(M, id, n, seed); break;
    case 'stack': stack(M, id, n, seed); break;
    case 'bales': bales(M, id, n, seed); break;
    case 'cans': rows(M, id, n, seed); break;
    case 'crates': rows(M, id, n, seed, true); break;
    case 'packs': rows(M, id, n, seed, n > 2); break;
    case 'rack': rack(M, id, n, seed); break;
  }
  return M;
}
const pileCache = new Map<string, { mat: MatKey; geo: THREE.BufferGeometry }[]>();
/** the merged geometry of a pile, cached (shared: do not dispose) */
export function pileGeo(id: string, n: number, seed = 1) {
  const k = `${id}|${n}|${seed}`;
  let g = pileCache.get(k);
  if (!g) {
    const M = pileMesher(id, n, seed), b = M.bounds(), c = b.getCenter(new THREE.Vector3());
    const C = new Mesher(); C.at([-c.x, -b.min.y, -c.z], [0, 0, 0], 1, () => C.merge(M));
    g = C.build(); for (const e of g) e.geo.userData.shared = true;
    if (pileCache.size > 600) { for (const [kk, v] of pileCache) { for (const e of v) e.geo.dispose(); pileCache.delete(kk); if (pileCache.size < 400) break; } }
    pileCache.set(k, g);
  }
  return g;
}
