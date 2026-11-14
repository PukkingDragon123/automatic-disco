// Geological formations, chosen per biome and sited where the land asks for them: granite tors on rises, glacial
// erratics in open ground, layered ledges along steep slopes with scree fanned out below, sandstone hoodoos and a
// rare arch in dry country, basalt column clusters in the ash, karst pillars in the jungle, sea stacks off the coast,
// crystal outcrops in the crystal flats, boulder fields where the ranges meet the plain, CAVE MOUTHS and OVERHANGS at
// the foot of cliffs (bats roost under them: region.overhangs; dens can use region.caves), moss-grown stones in damp
// woods, rounded stones along every river, fallen logs and stumps on the forest floor. Each piece takes its stone
// from the rock family under it (geo R). Big pieces lift the ground under them, so walkers path round them and
// nothing spawns or grows inside.
import { Rand, clamp, hash01 } from '../../core/rand';
import { B } from '../blockTex';
import { RockMat, type Region, type RockKind, type RockPiece } from '../region';
import { famMat } from './ores';

const hyp = (a: number, b: number, c = 0) => Math.sqrt(a * a + b * b + c * c);

type F = 'tor' | 'erratic' | 'stones' | 'ledge' | 'hoodoo' | 'pillar' | 'columns' | 'stack' | 'arch' | 'crystals' | 'field';
const TABLE: Record<string, [F, number][]> = {
  meadow: [['tor', 3], ['erratic', 2], ['stones', 2], ['ledge', 1], ['field', 1]],
  jungle: [['pillar', 2.5], ['stones', 3], ['tor', 1], ['arch', 0.3]],
  savanna: [['tor', 3], ['hoodoo', 1.4], ['erratic', 1], ['arch', 0.35]],
  marsh: [['stones', 3], ['erratic', 1]],
  highland: [['ledge', 3], ['tor', 2], ['erratic', 1], ['field', 1.5]],
  tundra: [['erratic', 3], ['tor', 1.5], ['ledge', 1], ['field', 1.5]],
  desert: [['hoodoo', 3], ['ledge', 2], ['arch', 0.8], ['erratic', 1]],
  crystal: [['crystals', 2.5], ['pillar', 1.5], ['hoodoo', 1], ['tor', 1]],
  ashland: [['columns', 3], ['ledge', 1], ['erratic', 2], ['field', 1]],
  coast: [['stack', 2], ['tor', 1], ['erratic', 2], ['stones', 1], ['arch', 0.3]],
};
const COUNT: Record<string, number> = { highland: 18, desert: 15, ashland: 15, tundra: 14, savanna: 13, crystal: 15, meadow: 13, coast: 12, jungle: 12, marsh: 9 };
const MOSS: Record<string, number> = { meadow: 0.5, jungle: 0.95, savanna: 0.1, marsh: 0.9, highland: 0.4, tundra: 0.2, desert: 0, crystal: 0.15, ashland: 0.06, coast: 0.35 };

export function formations(R: Region, r: Rand) {
  const N = R.N, bi = R.biome, L = R.landing, h0 = Float32Array.from(R.h);
  const moss0 = MOSS[bi.key] ?? 0.3;
  const g0 = (x: number, z: number) => {
    const fx = clamp(x - 0.5, 0, N - 1.001), fz = clamp(z - 0.5, 0, N - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return (h0[j * N + i] * (1 - u) + h0[j * N + i + 1] * u) * (1 - v) + (h0[(j + 1) * N + i] * (1 - u) + h0[(j + 1) * N + i + 1] * u) * v;
  };
  const cellOk = (x: number, z: number) => {
    if (x < 3 || z < 3 || x > N - 3 || z > N - 3) return false;
    const i = Math.floor(z) * N + Math.floor(x);
    return h0[i] >= R.water + 0.3 && R.riverY[i] <= 0 && R.b[i] !== B.SOIL && R.passMask[i] !== 2;
  };
  const matAt = (x: number, z: number): RockMat => famMat(R.geo[(clamp(Math.floor(z), 0, N - 1) * N + clamp(Math.floor(x), 0, N - 1)) * 4]);
  const grad = (x: number, z: number): [number, number] => [g0(x + 1, z) - g0(x - 1, z), g0(x, z + 1) - g0(x, z - 1)];
  const prom = (x: number, z: number) => { let s = 0; for (let a = 0; a < 8; a++) s += g0(x + Math.cos(a * 0.785) * 6, z + Math.sin(a * 0.785) * 6); return g0(x, z) - s / 8; };
  const centres: [number, number][] = [];
  let mat: RockMat = RockMat.GRANITE;
  const add = (k: RockKind, x: number, z: number, sx: number, sy: number, sz: number, o: Partial<RockPiece> = {}) => {
    // seat on the lowest ground under the footprint, sunk by a fraction of its height
    let y = g0(x, z);
    const rad = Math.min(sx, sz) * 0.7;
    for (let a = 0; a < 6; a++) y = Math.min(y, g0(x + Math.cos(a * 1.047) * rad, z + Math.sin(a * 1.047) * rad));
    const bury = o.y !== undefined ? 0 : sy * (k === 'spire' || k === 'column' || k === 'arch' || k === 'crystal' || k === 'cave' ? 0.06 : r.range(0.14, 0.3));
    R.rocks.push({ kind: k, mat, x, y: (o.y ?? y) - bury, z, sx, sy, sz, yaw: r.range(0, Math.PI * 2), tilt: 0, tiltDir: 0, seed: r.int(1, 1e9), moss: moss0, wet: 0, ...o, ...(o.y !== undefined ? { y: o.y } : {}) });
    return R.rocks[R.rocks.length - 1];
  };
  const scree = (x: number, z: number, rad: number, n: number, size: number, downhill = 0) => {
    const [gx, gz] = grad(x, z), gl = hyp(gx, gz) || 1;
    for (let i = 0; i < n; i++) {
      const a = r.range(0, Math.PI * 2), d = rad * Math.sqrt(r.next());
      let px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (downhill) { const t = r.range(0, downhill); px -= (gx / gl) * t; pz -= (gz / gl) * t; }
      if (!cellOk(px, pz) || hyp(px - L.x, pz - L.z) < 14) continue;
      const s0 = size * r.range(0.35, 1) * (r.chance(0.12) ? 1.8 : 1);
      add('pebble', px, pz, s0 * r.range(0.8, 1.3), s0 * r.range(0.5, 0.9), s0 * r.range(0.8, 1.3), { tilt: r.range(0, 0.5), tiltDir: r.range(0, 6.28) });
    }
  };
  const want = COUNT[bi.key] ?? 11, table = TABLE[bi.key] ?? TABLE.meadow;
  for (let f = 0, tries = 0; f < want && tries < want * 12; tries++) {
    const type = r.weighted(table);
    let bx = -1, bz = -1, bs = -1e9;
    for (let t = 0; t < 24; t++) {
      const x = r.range(8, N - 8), z = r.range(8, N - 8);
      if (!cellOk(x, z)) continue;
      const dl = hyp(x - L.x, z - L.z);
      if (dl < (type === 'arch' || type === 'columns' ? 22 : 19)) continue;
      if (centres.some(([cx, cz]) => hyp(cx - x, cz - z) < 13)) continue;
      const i = Math.floor(z) * N + Math.floor(x), [gx, gz] = grad(x, z), sl = hyp(gx, gz) * 0.5, m = R.mount[i];
      let sc = r.range(0, 0.6) - (m > 0.55 ? 1.5 : 0);
      if (type === 'tor') sc += prom(x, z) * 1.4 - sl * 0.3;
      else if (type === 'ledge') sc += sl * 3 - (sl > 1.2 ? 2 : 0);
      else if (type === 'stones') sc += R.forest[i] * 1.5 + R.wet[i];
      else if (type === 'erratic') sc += 1 - R.forest[i] - sl * 0.5;
      else if (type === 'hoodoo' || type === 'pillar' || type === 'crystals') sc += prom(x, z) * 0.6 + (1 - R.forest[i]) * 0.5;
      else if (type === 'field') sc += m > 0.15 && m < 0.6 ? 2.5 - sl : -3;
      else if (type === 'stack') { let near = 99; for (let a = 0; a < 12; a++) for (const d of [3, 6, 9]) if (h0[clamp(Math.floor(z + Math.sin(a * 0.52) * d), 0, N - 1) * N + clamp(Math.floor(x + Math.cos(a * 0.52) * d), 0, N - 1)] < R.water) near = Math.min(near, d); sc += near < 99 ? 2 - near * 0.15 : -3; }
      else if (type === 'arch') sc += 1 - sl * 2;
      else sc += sl;
      if (sc > bs) { bs = sc; bx = x; bz = z; }
    }
    if (bx < 0) continue;
    const x = bx, z = bz, i = Math.floor(z) * N + Math.floor(x), [gx, gz] = grad(x, z), gl = hyp(gx, gz) || 1;
    const mossy = clamp(moss0 + R.forest[i] * 0.3 + R.wet[i] * 0.15 - 0.1, 0, 1);
    mat = matAt(x, z);
    if (type === 'columns') mat = RockMat.BASALT;
    if (type === 'hoodoo' && mat !== RockMat.LIMESTONE && mat !== RockMat.TUFF) mat = RockMat.SANDSTONE;
    centres.push([x, z]); f++;
    if (type === 'tor') {
      const R0 = r.range(1.5, 2.3), n = r.int(2, 4), core: RockPiece[] = [];
      for (let k = 0; k < n; k++) {
        const a = r.range(0, 6.28), d = k ? r.range(R0 * 0.6, R0 * 1.15) : 0, Rr = R0 * (k ? r.range(0.55, 0.85) : 1);
        core.push(add('boulder', x + Math.cos(a) * d, z + Math.sin(a) * d, Rr * r.range(0.9, 1.15), Rr * r.range(0.75, 1.05), Rr * r.range(0.85, 1.1), { moss: mossy }));
      }
      if (r.chance(0.6)) { const b = core[0], Rr = R0 * r.range(0.45, 0.65); add('boulder', b.x + r.range(-0.4, 0.4), b.z + r.range(-0.4, 0.4), Rr, Rr * r.range(0.7, 0.95), Rr * r.range(0.8, 1), { y: b.y + b.sy * 0.82, moss: mossy * 0.6, tilt: r.range(0, 0.25), tiltDir: r.range(0, 6.28) }); }
      for (let k = r.int(3, 6); k > 0; k--) { const a = r.range(0, 6.28), d = r.range(R0 * 1.4, R0 * 2.4), Rr = r.range(0.45, 0.95); if (cellOk(x + Math.cos(a) * d, z + Math.sin(a) * d)) add('boulder', x + Math.cos(a) * d, z + Math.sin(a) * d, Rr, Rr * r.range(0.6, 0.9), Rr * r.range(0.8, 1.2), { moss: mossy }); }
      scree(x, z, R0 * 3, r.int(10, 18), 0.32, 3);
    } else if (type === 'erratic') {
      const Rr = r.range(1.1, 1.9);
      add('boulder', x, z, Rr * r.range(1, 1.3), Rr * r.range(0.8, 1.1), Rr, { moss: mossy, tilt: r.range(0, 0.18), tiltDir: r.range(0, 6.28) });
      for (let k = r.int(1, 3); k > 0; k--) { const a = r.range(0, 6.28), d = r.range(Rr * 1.3, Rr * 2.2), q = r.range(0.35, 0.7); add('boulder', x + Math.cos(a) * d, z + Math.sin(a) * d, q, q * 0.7, q, { moss: mossy }); }
      scree(x, z, Rr * 2.6, r.int(4, 9), 0.28);
    } else if (type === 'stones') {
      for (let k = r.int(4, 8); k > 0; k--) {
        const a = r.range(0, 6.28), d = r.range(0, 4.5), Rr = r.range(0.4, 1.1), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (cellOk(px, pz)) add('boulder', px, pz, Rr * r.range(1, 1.3), Rr * r.range(0.55, 0.85), Rr, { moss: clamp(mossy + 0.25, 0, 1) });
      }
      scree(x, z, 5, r.int(5, 10), 0.24);
    } else if (type === 'ledge') {
      const sa = Math.atan2(gz, gx) + Math.PI / 2, ca = Math.cos(sa), sn = Math.sin(sa), n = r.int(3, 6), dip = r.range(0.06, 0.22);
      let off = -((n - 1) / 2) * 2.8;
      for (let k = 0; k < n; k++) {
        const px = x + ca * off + (gx / gl) * r.range(-0.6, 0.6), pz = z + sn * off + (gz / gl) * r.range(-0.6, 0.6);
        off += r.range(2.2, 3.4);
        if (!cellOk(px, pz)) continue;
        add('slab', px, pz, r.range(1.5, 2.6), r.range(0.8, 1.6) * (bi.key === 'highland' || bi.key === 'desert' ? 1.25 : 1), r.range(1.1, 1.7), { yaw: sa + r.range(-0.2, 0.2), tilt: dip, tiltDir: Math.atan2(-gz, -gx), moss: mossy * 0.8 });
      }
      scree(x - (gx / gl) * 3, z - (gz / gl) * 3, 4.5, r.int(14, 26), 0.3, 4);
    } else if (type === 'hoodoo' || type === 'pillar' || type === 'stack') {
      const n = type === 'stack' ? r.int(1, 3) : r.int(3, 7);
      for (let k = 0; k < n; k++) {
        const a = r.range(0, 6.28), d = k ? r.range(1.6, 5) : 0, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (k && !cellOk(px, pz)) continue;
        const Rr = type === 'stack' ? r.range(1.0, 1.7) : r.range(0.5, 1.0), H = type === 'stack' ? r.range(3.5, 6.5) : type === 'pillar' ? r.range(2.4, 5.2) : r.range(1.8, 5.5) * (k ? 0.8 : 1);
        add('spire', px, pz, Rr, H, Rr * r.range(0.85, 1.15), { tilt: r.range(0, 0.06), tiltDir: r.range(0, 6.28), moss: type === 'pillar' ? clamp(mossy + 0.2, 0, 1) : mossy * 0.5, fam: type === 'hoodoo' ? 'hoodoo' : type === 'pillar' ? 'pillar' : 'stack' });
      }
      for (let k = r.int(1, 4); k > 0; k--) { const a = r.range(0, 6.28), d = r.range(1.5, 5), q = r.range(0.4, 0.9), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (cellOk(px, pz)) add('boulder', px, pz, q * 1.2, q * 0.7, q, { moss: mossy * 0.6, tilt: r.range(0, 0.4), tiltDir: r.range(0, 6.28) }); }
      scree(x, z, 5.5, r.int(8, 16), 0.26);
    } else if (type === 'columns') {
      add('column', x, z, r.range(1.8, 3.2), r.range(1.6, 3.8), 1, { moss: mossy * 0.4 });
      scree(x, z, 5, r.int(10, 18), 0.3, 2);
    } else if (type === 'arch') {
      const span = r.range(2.8, 4.2), A = add('arch', x, z, span, r.range(3, 4.6), r.range(0.9, 1.3), { moss: mossy * 0.5 });
      for (const sg of [-1, 1]) {
        const d = span + r.range(1.8, 2.6), px = x + Math.cos(A.yaw) * d * sg, pz = z + Math.sin(A.yaw) * d * sg;
        if (cellOk(px, pz)) add('slab', px, pz, r.range(1.6, 2.3), A.sy * r.range(0.45, 0.8), A.sz * r.range(1.1, 1.4), { yaw: A.yaw + r.range(-0.15, 0.15), moss: mossy * 0.4 });
      }
      scree(x, z, span * 1.8, r.int(8, 14), 0.3);
    } else if (type === 'crystals') {
      // a crystal outcrop: a rock heart with prisms bursting from it in a fan, smaller ones scattered round
      const hue = r.pick(['quartz', 'amethyst', 'quartz', 'sapphire'] as const);
      add('boulder', x, z, r.range(0.9, 1.3), r.range(0.6, 0.9), r.range(0.8, 1.1), { moss: 0 });
      for (let k = r.int(4, 8); k > 0; k--) {
        const a = r.range(0, 6.28), d = r.range(0, 1.3), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        add('crystal', px, pz, r.range(0.2, 0.42), r.range(0.8, 2.2), r.range(0.2, 0.4), { tilt: r.range(0.05, 0.55), tiltDir: a, moss: 0, ore: 1, hue });
      }
      for (let k = r.int(3, 7); k > 0; k--) { const a = r.range(0, 6.28), d = r.range(1.8, 4.5), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (cellOk(px, pz)) add('crystal', px, pz, r.range(0.12, 0.25), r.range(0.3, 0.8), r.range(0.12, 0.25), { tilt: r.range(0, 0.6), tiltDir: r.range(0, 6.28), moss: 0, ore: 1, hue }); }
      scree(x, z, 4, r.int(6, 12), 0.22);
    } else if (type === 'field') {
      // a boulder field: rock fallen from the range lying on the gentle ground at its foot
      const n = r.int(9, 16);
      for (let k = 0; k < n; k++) {
        const a = r.range(0, 6.28), d = r.range(0, 7), px = x + Math.cos(a) * d - (gx / gl) * r.range(0, 4), pz = z + Math.sin(a) * d - (gz / gl) * r.range(0, 4);
        if (!cellOk(px, pz) || hyp(px - L.x, pz - L.z) < 15) continue;
        mat = matAt(px, pz);
        const q = r.range(0.35, 1.3) * (r.chance(0.15) ? 1.5 : 1);
        add('boulder', px, pz, q * r.range(0.9, 1.3), q * r.range(0.6, 0.95), q, { moss: mossy * 0.7, tilt: r.range(0, 0.35), tiltDir: r.range(0, 6.28) });
      }
      scree(x, z, 8, r.int(18, 30), 0.3, 5);
    }
  }
  cliffFeatures(R, r, cellOk, add, moss0, (m) => { mat = m; });
  // the ranges dressed: strata ledges jutting from the riser tops, crags and pinnacles on the crests
  if (R.spines.length) {
    let ledges = 0, crags = 0;
    const wantL = Math.round(N * 0.12), wantC = Math.round(N * 0.05);
    for (let t = 0; t < 4000 && (ledges < wantL || crags < wantC); t++) {
      const x = r.range(4, N - 4), z = r.range(4, N - 4), i = Math.floor(z) * N + Math.floor(x);
      if (R.mount[i] < 0.45 || R.passMask[i] || R.riverY[i] > 0) continue;
      const h = g0(x, z);
      let lo = 1e9, hi = -1e9, ldx = 0, ldz = 0;
      for (let a = 0; a < 8; a++) { const dx = Math.cos(a * 0.785), dz = Math.sin(a * 0.785), v = g0(x + dx * 2, z + dz * 2); if (v < lo) { lo = v; ldx = dx; ldz = dz; } hi = Math.max(hi, v); }
      if (R.rocks.some((q) => (q.kind === 'slab' || q.kind === 'spire') && hyp(q.x - x, q.z - z) < 5)) continue;
      mat = matAt(x, z);
      if (ledges < wantL && h - lo > 1.8 && hi - h < 0.8) {
        // a bed of harder stone standing out over the riser below it
        add('slab', x + ldx * 0.6, z + ldz * 0.6, r.range(1.4, 2.6), r.range(0.5, 0.9), r.range(0.9, 1.5), { yaw: Math.atan2(ldz, ldx) + Math.PI / 2, y: h - r.range(0.35, 0.6), tilt: r.range(0.02, 0.1), tiltDir: Math.atan2(ldz, ldx), moss: moss0 * 0.5 });
        ledges++;
      } else if (crags < wantC && hi <= h + 0.3 && R.mount[i] > 0.7) {
        const Rr = r.range(0.7, 1.3);
        add('spire', x, z, Rr, r.range(2.2, 4.5), Rr * r.range(0.8, 1.15), { tilt: r.range(0, 0.12), tiltDir: r.range(0, 6.28), moss: 0, fam: 'stack' });
        for (let k = r.int(1, 3); k > 0; k--) { const a = r.range(0, 6.28), d = r.range(1.4, 2.6); add('boulder', x + Math.cos(a) * d, z + Math.sin(a) * d, r.range(0.5, 1), r.range(0.4, 0.8), r.range(0.5, 1), { moss: 0, tilt: r.range(0, 0.3), tiltDir: r.range(0, 6.28) }); }
        crags++;
      }
    }
  }
  // rounded stones along the rivers: on the banks, in the shallows, and as riffles where the water runs fast
  for (const pts of R.rivers) for (let k = 4; k < pts.length - 4; k += 2) {
    const p = pts[k];
    if (!r.chance(p.v > 1.3 ? 0.42 : 0.2)) continue;
    const q = pts[Math.min(pts.length - 1, k + 2)], tx = q.x - p.x, tz = q.z - p.z, tl = hyp(tx, tz) || 1;
    const side = r.chance(0.5) ? 1 : -1, d = p.v > 1.3 && r.chance(0.4) ? r.range(0, p.w * 0.8) : p.w + r.range(-0.6, 1.3);
    const px = p.x - (tz / tl) * d * side, pz = p.z + (tx / tl) * d * side;
    if (px < 1 || pz < 1 || px > N - 1 || pz > N - 1 || hyp(px - L.x, pz - L.z) < 14) continue;
    const Rr = r.range(0.22, 0.6) * (r.chance(0.1) ? 1.8 : 1), m = matAt(px, pz);
    R.rocks.push({ kind: 'river', mat: m === RockMat.SANDSTONE ? RockMat.GRANITE : m, x: px, y: g0(px, pz) - Rr * 0.2, z: pz, sx: Rr * r.range(1, 1.4), sy: Rr * r.range(0.45, 0.7), sz: Rr, yaw: r.range(0, 6.28), tilt: r.range(0, 0.25), tiltDir: r.range(0, 6.28), seed: r.int(1, 1e9), moss: bi.key === 'desert' ? 0 : r.range(0, 0.5), wet: 1 });
  }
  // the forest floor: fallen trunks lying along the slope, and old stumps, some broken off high
  let fc = 0; for (let i = 0; i < N * N; i++) if (R.forest[i] > 0.5) fc++;
  const nLogs = Math.round(fc * 0.0055), nStumps = Math.round(fc * 0.0035);
  const clearOf = (x: number, z: number, d: number) => !R.rocks.some((q) => q.kind !== 'pebble' && hyp(q.x - x, q.z - z) < d + Math.max(q.sx, q.sz));
  for (let t = 0, made = 0; t < nLogs * 10 && made < nLogs; t++) {
    const x = r.range(4, N - 4), z = r.range(4, N - 4), i = Math.floor(z) * N + Math.floor(x);
    if (R.forest[i] < 0.5 || !cellOk(x, z) || hyp(x - L.x, z - L.z) < 15 || !clearOf(x, z, 1.5)) continue;
    const len = r.range(3, 6.2), rad = r.range(0.2, 0.42), yaw = r.range(0, Math.PI * 2), c = Math.cos(yaw), sn = Math.sin(yaw);
    const ax = x - c * len * 0.5, az = z - sn * len * 0.5, bx = x + c * len * 0.5, bz = z + sn * len * 0.5;
    if (!cellOk(ax, az) || !cellOk(bx, bz)) continue;
    const ga = g0(ax, az), gb = g0(bx, bz), gm = g0(x, z);
    if (Math.abs(ga - gb) > len * 0.45) continue;
    R.rocks.push({ kind: 'log', mat: RockMat.WOOD, x, y: Math.min(gm, (ga + gb) / 2) - rad * 0.35, z, sx: len / 2, sy: rad, sz: rad, yaw, tilt: Math.atan2(Math.abs(ga - gb), len), tiltDir: gb < ga ? yaw : yaw + Math.PI, seed: r.int(1, 1e9), moss: clamp(moss0 + 0.25, 0, 1), wet: 0 });
    made++;
  }
  for (let t = 0, made = 0; t < nStumps * 10 && made < nStumps; t++) {
    const x = r.range(4, N - 4), z = r.range(4, N - 4), i = Math.floor(z) * N + Math.floor(x);
    if (R.forest[i] < 0.45 || !cellOk(x, z) || hyp(x - L.x, z - L.z) < 15 || !clearOf(x, z, 1.2)) continue;
    const rad = r.range(0.22, 0.46);
    R.rocks.push({ kind: 'stump', mat: RockMat.WOOD, x, y: g0(x, z) - 0.05, z, sx: rad, sy: r.chance(0.3) ? r.range(0.9, 1.6) : r.range(0.3, 0.7), sz: rad, yaw: r.range(0, 6.28), tilt: r.range(0, 0.08), tiltDir: r.range(0, 6.28), seed: r.int(1, 1e9), moss: clamp(moss0 + 0.2, 0, 1), wet: 0 });
    made++;
  }
  solidify(R);
}

/** cave mouths and overhangs at the foot of the cliffs a walker can reach */
function cliffFeatures(R: Region, r: Rand, cellOk: (x: number, z: number) => boolean, add: (k: RockKind, x: number, z: number, sx: number, sy: number, sz: number, o?: Partial<RockPiece>) => RockPiece, moss0: number, setMat: (m: RockMat) => void) {
  const N = R.N, L = R.landing, h = R.h;
  const wantCave = R.mount.some((m) => m > 0.5) ? r.int(1, 3) : r.int(0, 1), wantOver = r.int(2, 4);
  let caves = 0, overs = 0;
  for (let t = 0; t < 3000 && (caves < wantCave || overs < wantOver); t++) {
    const x = r.int(6, N - 7), z = r.int(6, N - 7), i = z * N + x;
    if (!cellOk(x + 0.5, z + 0.5) || R.solid[i] || hyp(x - L.x, z - L.z) < 20) continue;
    // the face: the direction in which the ground stands tallest within 2 m
    let fx = 0, fz = 0, rise = 0;
    for (let a = 0; a < 8; a++) {
      const dx = Math.cos(a * 0.785), dz = Math.sin(a * 0.785), X = Math.round(x + dx * 2), Z = Math.round(z + dz * 2);
      if (!R.inside(X, Z)) continue;
      const d = h[Z * N + X] - h[i]; if (d > rise) { rise = d; fx = dx; fz = dz; }
    }
    if (rise < 2.6) continue;
    // open ground in front of it
    const ox = x + 0.5 - fx * 3, oz = z + 0.5 - fz * 3;
    if (!cellOk(ox, oz) || Math.abs(R.heightAt(ox, oz) - h[i]) > 0.8) continue;
    if (R.rocks.some((q) => (q.kind === 'cave' || q.kind === 'overhang') && hyp(q.x - x, q.z - z) < 14)) continue;
    setMat(famMat(R.geo[(Math.min(N - 1, Math.round(z + fz * 2)) * N + Math.min(N - 1, Math.round(x + fx * 2))) * 4]));
    const yaw = Math.atan2(fz, fx), y = R.heightAt(x + 0.5, z + 0.5);
    if (caves < wantCave && rise > 3.2) {
      // the mouth is set into the face, its lintel and cheeks standing proud of it
      const cx = x + 0.5 + fx * 0.8, cz = z + 0.5 + fz * 0.8, span = r.range(1.1, 1.6), ht = Math.min(rise * 0.75, r.range(1.8, 2.6));
      add('cave', cx, cz, span, ht, r.range(1.8, 2.4), { yaw: yaw + Math.PI / 2, y: y - 0.1, moss: moss0 * 0.5 });
      R.caves.push({ x: x + 0.5, z: z + 0.5, y, dir: [-fx, -fz], r: span });
      caves++;
    } else if (overs < wantOver) {
      // a slab of the cap rock jutting out over the foot of the face
      const len = r.range(1.8, 2.8), top = Math.min(y + rise - 0.3, y + r.range(1.8, 2.8));
      const cx = x + 0.5 - fx * 0.2, cz = z + 0.5 - fz * 0.2;
      add('overhang', cx, cz, len, r.range(0.45, 0.7), r.range(1.3, 2.1), { yaw: yaw + Math.PI / 2, y: top, tilt: r.range(0.04, 0.12), tiltDir: yaw, moss: moss0 });
      R.overhangs.push({ x: x + 0.5 - fx * 0.9, z: z + 0.5 - fz * 0.9, y: top - 0.05, dir: [-fx, -fz] });
      overs++;
    }
  }
}

/** the ground answers: solid under big pieces (lifted so walkers go round), bare rock and scree around them */
function solidify(R: Region) {
  const N = R.N;
  for (const p of R.rocks) {
    if (p.kind === 'pebble' || p.kind === 'river' || p.kind === 'log' || p.kind === 'stump' || p.kind === 'node' || p.kind === 'crystal' || p.kind === 'floater' || p.kind === 'overhang') continue;
    const rockB = p.mat === RockMat.BASALT ? B.BASALT : B.ROCK;
    const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    const feet: [number, number, number, number][] = p.kind === 'arch' ? [[-p.sx, 0, p.sz * 1.1, p.sz * 1.1], [p.sx, 0, p.sz * 1.1, p.sz * 1.1]] : p.kind === 'cave' ? [[-p.sx * 1.1, 0, p.sz * 0.6, p.sz * 0.9], [p.sx * 1.1, 0, p.sz * 0.6, p.sz * 0.9]] : [[0, 0, p.sx, p.sz]];
    const lift = Math.min(1.75, p.sy * (p.kind === 'spire' || p.kind === 'column' ? 0.8 : p.sy < 1.3 ? 0.82 : 0.68));
    for (const [fx, fz, rx, rz] of feet) {
      const cx = p.x + fx * c - fz * sn, cz = p.z + fx * sn + fz * c;
      const ext = Math.ceil(Math.max(rx, rz) + 2);
      for (let z = Math.floor(cz) - ext; z <= Math.floor(cz) + ext; z++) for (let x = Math.floor(cx) - ext; x <= Math.floor(cx) + ext; x++) {
        if (!R.inside(x, z)) continue;
        const i = z * N + x;
        const inE = (px: number, pz: number, k: number) => { const dx = px - cx, dz = pz - cz, u = dx * c + dz * sn, v = -dx * sn + dz * c; return (u / (rx * k)) ** 2 + (v / (rz * k)) ** 2 <= 1; };
        const core = inE(x, z, 0.78) && inE(x + 1, z, 0.78) && inE(x, z + 1, 0.78) && inE(x + 1, z + 1, 0.78);
        const centre = (p.kind === 'spire' || p.kind === 'column') && inE(x + 0.5, z + 0.5, 1);
        if (core || centre) {
          R.solid[i] = 1; R.fert[i] = 0;
          if (lift > 0.3) R.h[i] = Math.max(R.h[i], p.y + lift);
          R.b[i] = rockB;
        } else if (inE(x + 0.5, z + 0.5, 1.25 + hash01(x, z, 77) * 0.45) && R.h[i] >= R.water && R.riverY[i] <= 0) {
          const hh = hash01(x, z, 78);
          if (R.b[i] === B.GRASS || R.b[i] === B.DRY || R.b[i] === B.LITTER || R.b[i] === B.SAND) R.b[i] = p.mat === RockMat.SANDSTONE ? (hh < 0.3 ? B.GRAVEL : B.SAND) : hh < 0.5 ? B.GRAVEL : hh < 0.7 ? rockB : R.b[i];
          R.fert[i] *= 0.6;
        }
      }
    }
  }
}
