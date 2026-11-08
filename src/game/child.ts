// The Veyr: a golem built on Earth. U.S. Planetary Corps hardware, atomic-age engineering, bolted into a chunk of
// asteroid and fired at an alien world to take it for humanity. A boulder of a chest with a riveted plate and a
// porthole onto its reactor; a head that floats free of the body with a camera lens, a visor or twin lamps; arms of
// loose stones joined by hydraulic pistons; a pack of vacuum tubes and exhausts on its back; a copper gravity coil
// where legs would be, with rubble circling it. Lichen and moss creep over the rock. It starts small and grows with
// its field. Every surface is hand-painted pixel texture (tileable rock with craters and glowing fissures, riveted
// plate steel, hazard paint, a stencilled chest plate) at high texel density, flat-shaded and faceted like the
// creatures; dressed by the player in the mirror pool (babyLook.ts, ui/babyEditor.ts).
import * as THREE from 'three';
import { makeRamp, mixHex } from '../limbo/gfx/pixel';
import { gbuf } from '../gfx/gbuf';
import { clamp, damp, hash01 } from '../core/rand';
import { Noise } from '../core/noise';
import type { Fx } from './fx';
import { type BabyLook, loadLook } from './babyLook';

const TAU = Math.PI * 2;
const N = 128;
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const sm = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------------------------------------ tileable noise
function tn(x: number, y: number, P: number, s: number) {
  const i0 = Math.floor(x), j0 = Math.floor(y), fx = x - i0, fy = y - j0, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const w = (a: number) => ((a % P) + P) % P;
  const a = hash01(w(i0), w(j0), s), b = hash01(w(i0 + 1), w(j0), s), c = hash01(w(i0), w(j0 + 1), s), d = hash01(w(i0 + 1), w(j0 + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, s: number, oct = 4, P0 = 4) {
  let v = 0, a = 0.5, t = 0, P = P0;
  for (let o = 0; o < oct; o++) { v += tn((x / N) * P, (y / N) * P, P, s + o * 101) * a; t += a; a *= 0.5; P *= 2; }
  return v / t;
}
/** tileable Worley: nearest and second-nearest jittered points (cell units) and their cell ids */
function worley(x: number, y: number, C: number, s: number) {
  const cx = (x / N) * C, cy = (y / N) * C, i0 = Math.floor(cx), j0 = Math.floor(cy);
  let f1 = 9, f2 = 9, id1 = 0, id2 = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const i = i0 + di, j = j0 + dj, wi = ((i % C) + C) % C, wj = ((j % C) + C) % C;
    const px = i + 0.15 + hash01(wi, wj, s) * 0.7, py = j + 0.15 + hash01(wj, wi, s + 7) * 0.7;
    const d = Math.hypot(cx - px, cy - py), id = wi + wj * C;
    if (d < f1) { f2 = f1; id2 = id1; f1 = d; id1 = id; } else if (d < f2) { f2 = d; id2 = id; }
  }
  return { f1, f2, id1, id2 };
}

// ------------------------------------------------------------------------------------------------ painting
class Px {
  readonly d: Uint8Array;
  constructor(readonly w: number, readonly h: number) { this.d = new Uint8Array(w * h * 4); }
  set(x: number, y: number, c: number, a = 255) { const i = (y * this.w + x) * 4; this.d[i] = (c >> 16) & 255; this.d[i + 1] = (c >> 8) & 255; this.d[i + 2] = c & 255; this.d[i + 3] = a; }
  get(x: number, y: number) { const i = (y * this.w + x) * 4; return (this.d[i] << 16) | (this.d[i + 1] << 8) | this.d[i + 2]; }
  ramp(x: number, y: number, R: number[], k: number, a = 255) { const kk = k + (BAY[(y & 3) * 4 + (x & 3)] / 16 - 0.47) * 0.55; this.set(x, y, R[clamp(Math.round(kk), 0, R.length - 1)], a); }
  tex(repeat = true) {
    const t = new THREE.DataTexture(this.d, this.w, this.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter; t.generateMipmaps = true;
    t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
    return t;
  }
}
const GLYPHS = [
  '..##...#..#.#....##....#.#..#...##..', '#....#.#..#...##....##...#..#.#....#', '..#.....#...######..#.....#.....#...', '#.....##....#.#...#..#..#...#.######',
  '.####.#....#..##....##..#....#.####.', '#.#.#.#.#.#.#.#.#.######............', '..#....###..#.#.#...#.....#....#.#..', '######.#..#..#..#..#..#..#..######..',
];
/** rock: grain, strata, cracks, craters; fissures that burn with the core's colour; kind 1 adds lichen or moss */
function paintRock(L: BabyLook, kind: 0 | 1 | 2) {
  const P = new Px(N, N), R = makeRamp(L.rock, 8, { spread: 0.62, hueShift: 0.02, satShift: 0.03 });
  const glowC = mixHex(L.glow, 0xffffff, 0.3), hot = mixHex(L.glow, 0xffffff, 0.7);
  const dens = kind === 2 ? 0.8 : 0.06, gl = new Uint8Array(N * N), K = new Float32Array(N * N);
  const cr = Array.from({ length: kind === 2 ? 2 : 5 }, (_, i) => ({ x: hash01(i, 3, 77 + kind) * N, y: hash01(i, 5, 77 + kind) * N, r: 5 + hash01(i, 9, 77) * 10 }));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const big = fbm(x, y, 11, 3, 3), fine = fbm(x, y, 23, 2, 16), grain = hash01(x, y, 5);
    let k = 3.5 + (big - 0.5) * 2.6 + (fine - 0.5) * 1.4 + (grain - 0.5) * 0.9 + Math.sin((y * 0.9 + x * 0.25 + big * 30) * 0.32) * 0.25;
    const W = worley(x, y, 5, 31), e = W.f2 - W.f1;
    const strong = hash01(Math.min(W.id1, W.id2), Math.max(W.id1, W.id2), 21) < 0.4;
    if (e < 0.04) k -= strong ? 2 : 0.6; else if (e < 0.08 && strong) k -= 0.7; else if (e < 0.11 && strong) k += 0.4;
    const W2 = worley(x, y, 11, 41), e2 = W2.f2 - W2.f1;
    if (e2 < 0.035 && hash01(W2.id1 + W2.id2, 3, 9) < 0.5) k -= 1.2;
    for (const c of cr) {
      let dx = x - c.x, dy = y - c.y; dx -= Math.round(dx / N) * N; dy -= Math.round(dy / N) * N;
      const r = Math.hypot(dx, dy) / c.r, lit = dx + dy > 0;
      if (r < 0.8) k -= 0.9 + (lit ? -0.5 : 0.6) * r; else if (r < 1.1) k += lit ? -0.5 : 1.0;
    }
    let g = 0;
    if (L.veins === 'cracks') { if (e < 0.042 && hash01(Math.min(W.id1, W.id2), Math.max(W.id1, W.id2), 13) < dens) g = e < 0.018 ? 3 : 2; }
    else if (L.veins === 'veins') { const f = fbm(x, y, 61, 3, 4), m = fbm(x, y, 71, 2, 2); if (Math.abs(f - 0.5) < 0.016 && m > 0.75 - dens * 0.6) g = Math.abs(f - 0.5) < 0.006 ? 3 : 2; }
    else { const cx = x >> 4, cy = y >> 4, lx = (x & 15) - 5, ly = (y & 15) - 5; if (hash01(cx, cy, 19 + kind) < dens * 0.8 && lx >= 0 && lx < 6 && ly >= 0 && ly < 6 && GLYPHS[Math.floor(hash01(cy, cx, 23) * 8)][ly * 6 + lx] === '#') g = 2; if (kind === 2 && (e < 0.03)) g = Math.max(g, 2); }
    if (kind === 2 && e < 0.07 && hash01(Math.min(W.id1, W.id2), Math.max(W.id1, W.id2), 17) < 0.6) g = Math.max(g, e < 0.03 ? 3 : 2);
    gl[y * N + x] = g; K[y * N + x] = k;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const p = y * N + x, g = gl[p];
    if (g >= 2) { P.set(x, y, g === 3 ? hot : glowC, 150); continue; }
    let near = false;
    for (let d = 1; d <= 2 && !near; d++) for (const [ox, oy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) if (gl[((y + oy + N) % N) * N + ((x + ox + N) % N)] >= 2) near = true;
    if (near) { P.set(x, y, mixHex(R[clamp(Math.round(K[p]), 0, 7)], L.glow, 0.4), 225); continue; }
    P.ramp(x, y, R, K[p]);
  }
  if (kind === 1 && L.moss !== 'none') {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fine = fbm(x, y, 29, 2, 16), h = hash01(x, y, 93);
      if (L.moss === 'moss') {
        const m = fbm(x, y, 91, 3, 4) + (h - 0.5) * 0.08;
        if (m < 0.46) continue;
        const MG = makeRamp(0x55703a, 7, { spread: 0.6, hueShift: 0.05 }), Wm = worley(x, y, 14, 95);
        let k = 3.2 + (0.5 - Wm.f1) * 2.6 + (fine - 0.5) * 1.6 + (h - 0.5) * 1.3;
        if (m < 0.49) k -= 1.3;
        if (h < 0.02) k = 6.5;
        P.ramp(x, y, MG, k);
      } else {
        const Wl = worley(x, y, 9, 97);
        if (Wl.f1 > 0.2 + hash01(Wl.id1, 1, 99) * 0.12 || hash01(Wl.id1, 4, 99) < 0.3) continue;
        const ty = hash01(Wl.id1, 2, 99), LR = makeRamp(ty < 0.55 ? 0x9aa486 : ty < 0.85 ? 0xbca85a : 0xc0763a, 5, { spread: 0.45 });
        P.ramp(x, y, LR, 2.3 + (Wl.f1 > 0.25 ? 1.4 : 0) + (h - 0.5) * 1.4 + (fine - 0.5));
      }
    }
  }
  return P.tex();
}
/** glass and crystal: faceted, lit from within (alpha < 1 marks emissive texels) */
function paintGlow(L: BabyLook) {
  const P = new Px(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x + y * 0.55, v = y - x * 0.35, fa = Math.floor(u / 13), fb = Math.floor(v / 15), s = hash01(fa, fb, 5);
    const edge = u % 13 < 1 || v % 15 < 1;
    let c = s > 0.5 ? mixHex(L.glow, 0xffffff, (s - 0.5) * 0.9) : mixHex(L.glow, 0x0a1420, (0.5 - s) * 0.7);
    if (edge) c = mixHex(L.glow, 0xffffff, 0.75);
    if (hash01(x, y, 8) < 0.01) c = 0xffffff;
    P.set(x, y, c, 190);
  }
  return P.tex();
}
/** plate steel: panels, bevelled seams, rivets, brushed grain, worn edges, grime and rust */
export function paintMetal(base: number, hazard = false) {
  const P = new Px(N, N), M = makeRamp(base, 8, { spread: 0.5, hueShift: 0.02, satShift: 0.02 });
  const Y = makeRamp(0xd0a020, 7, { spread: 0.45 }), B = makeRamp(0x24221e, 5, { spread: 0.5 }), bare = 0xb8b4a8;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const row = y >> 5, sx = (x + (row & 1) * 32) & 63, sy = y & 31;
    const fine = fbm(x, y, 37, 2, 16), grime = fbm(x, y, 41, 3, 4), h = hash01(x, y, 3);
    let k = 4.2 + (fine - 0.5) * 0.9 + (h - 0.5) * 0.5 + (hash01(y, 3, 7) - 0.5) * 0.45 - (grime < 0.4 ? (0.4 - grime) * 5 : 0);
    let R = M;
    if (hazard) { const st = ((x + y) & 31) < 16; R = st ? Y : B; k = (st ? 3.6 : 2.4) + (fine - 0.5) * 0.9 + (h - 0.5) * 0.5 - (grime < 0.4 ? (0.4 - grime) * 4 : 0); }
    const seam = sx === 0 || sy === 0, bev = sx === 1 || sy === 1, sh = sx === 63 || sy === 31;
    if (seam) k = 0.8; else if (bev) k += 1.4; else if (sh) k -= 0.9;
    const dEdge = Math.min(sx, 63 - sx, sy, 31 - sy);
    const rv = (sy === 4 || sy === 27) && sx % 8 === 4 ? 1 : (sx === 4 || sx === 59) && sy % 8 === 4 ? 1 : 0;
    const rvB = ((sy === 5 || sy === 28) && sx % 8 === 5) || ((sx === 5 || sx === 60) && sy % 8 === 5);
    const rvS = ((sy === 5 || sy === 28) && sx % 8 === 4) || ((sx === 5 || sx === 60) && sy % 8 === 4) || ((sy === 4 || sy === 27) && sx % 8 === 5) || ((sx === 4 || sx === 59) && sy % 8 === 5);
    if (rv) { P.set(x, y, mixHex(M[7], 0xffffff, 0.35)); continue; }
    if (rvS) { P.set(x, y, M[5]); continue; }
    if (rvB) { P.set(x, y, M[1]); continue; }
    const wear = dEdge < 3 && fbm(x, y, 47, 2, 8) > 0.58;
    const scratch = Math.abs(((x * 0.7 + y) % 23) - 11) < 0.5 && fbm(x, y, 53, 2, 4) > 0.62;
    if (wear || scratch) { P.set(x, y, mixHex(bare, M[3], 0.25 + h * 0.2)); continue; }
    if (fbm(x, y, 59, 3, 4) > 0.74) { P.set(x, y, mixHex(R[clamp(Math.round(k), 0, R.length - 1)], 0x7a4626, 0.55)); continue; }
    P.ramp(x, y, R, hazard ? Math.min(k, R.length - 1) : k);
  }
  return P.tex();
}
const FONT: Record<string, string> = {
  U: '101101101101111', S: '111100111001111', P: '111101111100100', C: '111100100100111', '.': '000000000000010', N: '101111111111101', I: '111010010010111', T: '111010010010010',
  '0': '111101101101111', '7': '111001010010010', '-': '000000111000000', ' ': '000000000000000', V: '101101101101010', E: '111100110100111', Y: '101101010010010', R: '110101110101101', A: '010101111101101',
};
/** the chest plate: plate steel with a riveted border, a star and the Corps' stencil */
function paintPlate(L: BabyLook) {
  const W = 96, H = 72, P = new Px(W, H), M = makeRamp(L.metal, 8, { spread: 0.5 });
  const lum = ((L.metal >> 16) & 255) * 0.3 + ((L.metal >> 8) & 255) * 0.59 + (L.metal & 255) * 0.11, ink = lum > 140 ? 0x2a2620 : 0xe8e2cc;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.min(x, W - 1 - x, y, H - 1 - y), fine = fbm(x, y, 7, 2, 16), h = hash01(x, y, 2);
    let k = 4.2 + (fine - 0.5) * 0.9 + (h - 0.5) * 0.5;
    if (d === 0) k = 1; else if (d === 1) k = x < W / 2 || y < H / 2 ? 6.5 : 2.5; else if (d === 2) k += 0.6;
    P.ramp(x, y, M, k);
    if (d > 2 && d < 5 && fbm(x, y, 9, 2, 8) > 0.6) P.set(x, y, mixHex(0xb8b4a8, M[3], 0.3));
    if (d === 4 && ((x + y) % 8 === 0)) { P.set(x, y, mixHex(M[7], 0xffffff, 0.4)); if (x + 1 < W) P.set(x + 1, y, M[5]); if (y + 1 < H) P.set(x, y + 1, M[1]); }
  }
  const text = (s: string, ox: number, oy: number, sc: number) => {
    let cx = ox;
    for (const ch of s) { const g = FONT[ch] ?? FONT[' ']; for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1') for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) { const px = cx + i * sc + a, py = oy + j * sc + b; if (hash01(px, py, 61) > 0.12) P.set(px, py, ink); } cx += 4 * sc; }
  };
  const label = 'U.S.P.C.', unit = 'UNIT 07';
  text(label, Math.round((W - label.length * 8) / 2), 8, 2);
  text(unit, Math.round((W - unit.length * 4) / 2), H - 13, 1);
  // a five-point star in a ring, left of the porthole
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - 17, dy = y - 38, r = Math.hypot(dx, dy);
    if (r > 8 && r < 10) { P.set(x, y, ink); continue; }
    const a = Math.atan2(dy, dx) + Math.PI / 2, star = 7 * (0.55 + 0.45 * Math.cos(5 * ((a % (TAU / 5) + TAU / 5) % (TAU / 5) - TAU / 10)) ** 6);
    if (r < Math.max(3, star) && hash01(x, y, 63) > 0.1) P.set(x, y, ink);
  }
  return P.tex(false);
}

// ------------------------------------------------------------------------------------------------ geometry
const TS = 2.6; // texture repeats per world unit
const M_ROCK = 0, M_MOSS = 1, M_FISS = 2, M_GLOW = 3, M_METAL = 4, M_HAZ = 5;
type Pick = (n: THREE.Vector3, c: THREE.Vector3) => number;
/** a lumpy faceted rock: noise-displaced icosphere with craters; faces sorted into material groups, box-projected UVs */
function rockGeo(seed: number, size: [number, number, number], detail: number, rough: number, pick: Pick, craters = 2) {
  const nz = new Noise(seed), base = new THREE.IcosahedronGeometry(1, detail), P = base.attributes.position as THREE.BufferAttribute;
  const cr = Array.from({ length: craters }, (_, i) => ({ v: new THREE.Vector3(hash01(seed, i, 1) - 0.5, hash01(seed, i, 2) - 0.5, hash01(seed, i, 3) - 0.5).normalize(), r: 0.25 + hash01(seed, i, 4) * 0.25, d: 0.05 + hash01(seed, i, 5) * 0.07 }));
  const tmp = new THREE.Vector3();
  const disp = (x: number, y: number, z: number) => {
    tmp.set(x, y, z).normalize();
    let r = 1 + nz.fbm3(tmp.x * 1.8 + seed * 0.37, tmp.y * 1.8, tmp.z * 1.8, 3) * rough + Math.abs(nz.n3(tmp.x * 5, tmp.y * 5, tmp.z * 5)) * rough * 0.3;
    for (const c of cr) { const a = Math.acos(clamp(tmp.dot(c.v), -1, 1)) / c.r; if (a < 1) r -= c.d * (1 - a * a); else if (a < 1.35) r += c.d * 0.35 * Math.sin(((a - 1) / 0.35) * Math.PI); }
    return new THREE.Vector3(tmp.x * r * size[0], tmp.y * r * size[1], tmp.z * r * size[2]);
  };
  const bk: number[][] = [[], [], [], [], [], []], ub: number[][] = [[], [], [], [], [], []];
  const ou = hash01(seed, 9, 9) * 4, ov = hash01(seed, 10, 9) * 4, e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let t = 0; t < P.count; t += 3) {
    const v = [0, 1, 2].map((k) => disp(P.getX(t + k), P.getY(t + k), P.getZ(t + k)));
    const n = e1.subVectors(v[1], v[0]).cross(e2.subVectors(v[2], v[0])).normalize().clone();
    const c = v[0].clone().add(v[1]).add(v[2]).multiplyScalar(1 / 3), m = pick(n, c);
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (const p of v) {
      bk[m].push(p.x, p.y, p.z);
      const [u, w] = ax >= ay && ax >= az ? [p.z, p.y] : ay >= az ? [p.x, p.z] : [p.x, p.y];
      ub[m].push(u * TS + ou, w * TS + ov);
    }
  }
  const pos: number[] = [], uv: number[] = [], g = new THREE.BufferGeometry();
  let start = 0;
  bk.forEach((b, m) => { if (!b.length) return; for (const x of b) pos.push(x); for (const x of ub[m]) uv.push(x); g.addGroup(start, b.length / 3, m); start += b.length / 3; });
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals(); g.computeBoundingSphere(); base.dispose();
  return g;
}
/** box-project UVs onto any geometry (texel density matched to the rocks) */
export function projUV<G extends THREE.BufferGeometry>(g: G, sc = TS, seed = 0): G {
  const P = g.attributes.position as THREE.BufferAttribute, Nn = g.attributes.normal as THREE.BufferAttribute, uv: number[] = [];
  const ou = hash01(seed, 1, 3) * 3, ov = hash01(seed, 2, 3) * 3;
  for (let i = 0; i < P.count; i++) {
    const ax = Math.abs(Nn.getX(i)), ay = Math.abs(Nn.getY(i)), az = Math.abs(Nn.getZ(i)), x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const [u, w] = ax >= ay && ax >= az ? [z, y] : ay >= az ? [x, z] : [x, y];
    uv.push(u * sc + ou, w * sc + ov);
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** a box with rounded edges (BoxGeometry pushed out from an inner box), keeping its six face groups */
export function roundBox(w: number, h: number, d: number, r: number) {
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3), P = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3(), q = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i); q.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
    const o = v.clone().sub(q); if (o.lengthSq() > 1e-9) o.setLength(r); v.copy(q).add(o); P.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------------------------------------ the golem
interface Arm { root: THREE.Group; upper: THREE.Group; fore: THREE.Group; hand: THREE.Group; pist: { g: THREE.Group; to: THREE.Group }[]; k: number }
interface Rig {
  model: THREE.Group; body: THREE.Group; head: THREE.Group; jaw: THREE.Group; arms: Arm[]; eyes: THREE.Mesh[]; rubble: THREE.Mesh[]; stones: THREE.Mesh[];
  dish: THREE.Group | null; bulb: THREE.Mesh | null; exhaust: THREE.Object3D[]; tex: THREE.Texture[]; geos: THREE.BufferGeometry[]; armX: number;
}
export class VeyrChild {
  readonly root = new THREE.Group();
  private rig = new THREE.Group();
  private R: Rig | null = null;
  private mats: THREE.Material[];
  private chrome: THREE.MeshPhongMaterial; private brass: THREE.MeshPhongMaterial; private rubber: THREE.MeshLambertMaterial;
  private eyeMat: THREE.MeshBasicMaterial; private dishMat: THREE.MeshPhongMaterial; private bulbMat: THREE.MeshBasicMaterial; private plateMat: THREE.MeshLambertMaterial;
  private glowU = { value: 0.6 };
  private ring: THREE.Mesh;
  private t = 0; private blinkT = 3; private castT = 0; private castAt = new THREE.Vector3(); private smokeT = 1;
  private waveT = 0; private actT = 4; private act: 'scatter' | 'spin' | 'flex' | 'juggle' | null = null; private actK = 0;
  private baseScale: number; private grow = 0.72; private growTo = 0.72;
  hatch = 0; // 0 sealed .. 1 out and afloat
  look = new THREE.Vector3();
  private lookYaw = 0; private lookPitch = 0;
  private look_: BabyLook;
  onCast?: () => void;
  constructor(readonly fx: Fx, scale = 1.25, look?: BabyLook, opts: { grown?: boolean } = {}) {
    this.look_ = look ?? loadLook();
    this.baseScale = scale;
    if (opts.grown) this.grow = this.growTo = 1;
    const glowU = this.glowU;
    const lit = (key: string) => {
      const m = new THREE.MeshLambertMaterial({ flatShading: true });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uGlowK = glowU;
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uGlowK;')
          .replace('#include <map_fragment>', '#include <map_fragment>\nfloat glowA = sampledDiffuseColor.a; vec3 glowC = sampledDiffuseColor.rgb; diffuseColor.a = 1.0;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (glowA < 0.98) totalEmissiveRadiance += glowC * uGlowK * (glowA < 0.7 ? 1.6 : 0.5);');
      };
      m.customProgramCacheKey = () => 'veyr-golem-' + key;
      gbuf(m, 1);
      return m;
    };
    this.mats = ['rock', 'moss', 'fiss', 'glow', 'metal', 'haz'].map(lit);
    this.plateMat = lit('plate'); this.plateMat.flatShading = false;
    this.chrome = new THREE.MeshPhongMaterial({ color: 0xb4b6b8, shininess: 90, specular: new THREE.Color(0xffffff) }); gbuf(this.chrome, 1);
    this.brass = new THREE.MeshPhongMaterial({ color: 0xb08a40, shininess: 60, specular: new THREE.Color(0xffe0a0), flatShading: true }); gbuf(this.brass, 1);
    this.rubber = new THREE.MeshLambertMaterial({ color: 0x24221f }); gbuf(this.rubber, 1);
    this.dishMat = new THREE.MeshPhongMaterial({ color: 0x9a9c9a, shininess: 50, side: THREE.DoubleSide, flatShading: true }); gbuf(this.dishMat, 1);
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); gbuf(this.eyeMat, 1);
    this.bulbMat = new THREE.MeshBasicMaterial({ color: 0xff3a2a }); gbuf(this.bulbMat, 1);
    this.root.add(this.rig);
    const rmat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }); gbuf(rmat, 0);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.01, 4, 40), rmat); this.ring.rotation.x = Math.PI / 2; this.rig.add(this.ring);
    this.setLook(this.look_);
    this.root.visible = false;
  }
  get lookData() { return this.look_; }
  /** rebuild for a new look */
  setLook(L: BabyLook) {
    this.look_ = { ...L };
    if (this.R) { this.R.model.removeFromParent(); this.R.geos.forEach((g) => g.dispose()); this.R.tex.forEach((t) => t.dispose()); }
    const tex = [paintRock(L, 0), paintRock(L, 1), paintRock(L, 2), paintGlow(L), paintMetal(L.metal), paintMetal(L.metal, true)];
    tex.forEach((t, i) => { (this.mats[i] as THREE.MeshLambertMaterial).map = t; this.mats[i].needsUpdate = true; });
    const plate = paintPlate(L); this.plateMat.map = plate; this.plateMat.needsUpdate = true;
    this.eyeMat.color.set(mixHex(L.glow, 0xffffff, 0.55));
    (this.ring.material as THREE.MeshBasicMaterial).color.set(L.glow).multiplyScalar(1.4);
    this.R = this.build(L, [...tex, plate]);
    this.rig.add(this.R.model);
  }
  private build(L: BabyLook, tex: THREE.Texture[]): Rig {
    const geos: THREE.BufferGeometry[] = [], mats = this.mats, mossy = L.moss !== 'none';
    const G = <T extends THREE.BufferGeometry>(g: T) => { geos.push(g); return g; };
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], parent: THREE.Object3D, p: [number, number, number] = [0, 0, 0], r: [number, number, number] = [0, 0, 0]) => {
      const o = new THREE.Mesh(g, m); o.position.set(...p); o.rotation.set(...r); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
    };
    const rk = (seed: number, size: [number, number, number], detail: number, rough: number, pick?: Pick, craters = 2) =>
      G(rockGeo(seed, size, detail, rough, pick ?? ((n) => (mossy && n.y > 0.5 ? M_MOSS : M_ROCK)), craters));
    const metalBox = (w: number, h: number, d: number, rad = 0.008, seed = 1) => G(projUV(roundBox(w, h, d, rad), TS, seed));
    const cyl = (r0: number, r1: number, h: number, seg = 10) => G(projUV(new THREE.CylinderGeometry(r0, r1, h, seg, 1), TS));
    const bb = 0.9 + L.bulk * 0.25, ab = 0.88 + L.bulk * 0.3;
    const model = new THREE.Group();
    // ---- gravity coil and the rubble it holds
    const coil = new THREE.Group(); coil.position.y = 0.2; model.add(coil);
    for (let i = 0; i < 4; i++) mesh(G(new THREE.TorusGeometry(0.12 - i * 0.012, 0.016, 6, 22)), this.brass, coil, [0, -i * 0.028, 0], [Math.PI / 2, 0, 0]);
    mesh(cyl(0.04, 0.06, 0.12, 8), mats[M_METAL], coil, [0, -0.03, 0]);
    const rubble: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) { const s = 0.035 + hash01(i, 4, 1) * 0.03; const m = mesh(rk(300 + i, [s, s * 0.8, s], 1, 0.25), mats, model); m.userData = { a: (i / 4) * TAU, r: 0.2 + hash01(i, 2, 1) * 0.05, y: 0.12 + hash01(i, 3, 1) * 0.08, sp: 0.6 + hash01(i, 5, 1) * 0.4 }; rubble.push(m); }
    // ---- the chest: a boulder with a riveted plate, a porthole onto the reactor, a tube pack and exhausts behind
    const body = new THREE.Group(); body.position.y = 0.5; model.add(body);
    const tw: [number, number, number] = [0.3 * bb, 0.27, 0.24 * bb];
    mesh(rk(101, tw, 3, 0.16, (n, c) => (mossy && n.y > 0.5 && c.y > 0.08 ? M_MOSS : c.y < -0.12 && n.y < -0.2 && Math.abs(c.x) < 0.15 ? M_FISS : M_ROCK), 3), mats, body);
    const pz = tw[2] * 1.02;
    const pg = G(projUV(roundBox(0.25 * bb, 0.19, 0.09, 0.012)));
    { // the plate's front face (group 4, +z) carries the stencil decal, 0..1 across the face
      const P = pg.attributes.position as THREE.BufferAttribute, Nn = pg.attributes.normal as THREE.BufferAttribute, U = pg.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < P.count; i++) if (Nn.getZ(i) > 0.5) U.setXY(i, P.getX(i) / (0.25 * bb) + 0.5, 0.5 - P.getY(i) / 0.19);
    }
    mesh(pg, [mats[M_METAL], mats[M_METAL], mats[M_METAL], mats[M_METAL], this.plateMat, mats[M_METAL]], body, [0, 0.01, pz], [-0.08, 0, 0]);
    const port = new THREE.Group(); port.position.set(0.035 * bb, -0.012, pz + 0.05); port.rotation.x = -0.08; body.add(port);
    mesh(G(new THREE.TorusGeometry(0.048, 0.012, 6, 18)), this.brass, port);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; mesh(G(new THREE.SphereGeometry(0.006, 4, 3)), this.chrome, port, [Math.cos(a) * 0.048, Math.sin(a) * 0.048, 0.011]); }
    mesh(G(new THREE.CircleGeometry(0.04, 16)), mats[M_GLOW], port, [0, 0, -0.004]);
    mesh(G(new THREE.IcosahedronGeometry(0.026, 0)), mats[M_GLOW], port, [0, 0, -0.02]);
    // tube pack
    const pack = new THREE.Group(); pack.position.set(0, 0.1, -tw[2] * 0.85); pack.rotation.x = 0.25; body.add(pack);
    mesh(metalBox(0.2 * bb, 0.07, 0.09, 0.012, 3), mats[M_METAL], pack);
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.055;
      mesh(cyl(0.022, 0.022, 0.08, 8), mats[M_GLOW], pack, [x, 0.07, 0]);
      mesh(G(new THREE.SphereGeometry(0.022, 8, 4, 0, TAU, 0, Math.PI / 2)), mats[M_GLOW], pack, [x, 0.11, 0]);
      mesh(cyl(0.026, 0.026, 0.02, 8), this.chrome, pack, [x, 0.035, 0]);
    }
    const exhaust: THREE.Object3D[] = [];
    for (const k of [-1, 1]) {
      const ex = new THREE.Group(); ex.position.set(k * 0.15 * bb, 0.14, -tw[2] * 0.6); ex.rotation.set(-0.5, 0, k * 0.2); body.add(ex);
      mesh(cyl(0.016, 0.02, 0.14, 8), this.chrome, ex, [0, 0.05, 0]);
      mesh(cyl(0.022, 0.022, 0.02, 8), this.rubber, ex, [0, 0.125, 0]);
      const tip = new THREE.Object3D(); tip.position.set(0, 0.14, 0); ex.add(tip); exhaust.push(tip);
    }
    // bolted brackets on the flanks
    for (const k of [-1, 1]) mesh(metalBox(0.03, 0.09, 0.07, 0.006, 5 + k), mats[M_METAL], body, [k * tw[0] * 0.93, -0.04, 0.03], [0, 0, k * -0.15]);
    // ---- the head: a rock floating free of the body, with an Earth-made face
    const head = new THREE.Group(); head.position.y = 0.88; model.add(head);
    mesh(rk(202, [0.155, 0.13, 0.145], 3, 0.14, (n, c) => (mossy && n.y > 0.55 && c.y > 0.04 ? M_MOSS : M_ROCK), 2), mats, head);
    const eyes: THREE.Mesh[] = [];
    if (L.head === 'lens') {
      const lens = new THREE.Group(); lens.position.set(0, 0.005, 0.125); head.add(lens);
      mesh(cyl(0.06, 0.066, 0.06, 14), this.brass, lens, [0, 0, 0], [Math.PI / 2, 0, 0]);
      mesh(G(new THREE.TorusGeometry(0.052, 0.008, 6, 18)), this.chrome, lens, [0, 0, 0.031]);
      eyes.push(mesh(G(new THREE.CircleGeometry(0.046, 18)), this.eyeMat, lens, [0, 0, 0.028]));
      mesh(G(new THREE.TorusGeometry(0.03, 0.007, 4, 14)), this.rubber, lens, [0, 0, 0.032]);
      mesh(G(new THREE.CircleGeometry(0.014, 10)), this.rubber, lens, [0, 0, 0.033]);
      mesh(metalBox(0.17, 0.026, 0.08, 0.006, 7), mats[M_METAL], head, [0, 0.07, 0.1], [0.25, 0, 0]);
    } else if (L.head === 'visor') {
      mesh(metalBox(0.27, 0.075, 0.08, 0.012, 8), mats[M_METAL], head, [0, 0.015, 0.11]);
      eyes.push(mesh(G(new THREE.BoxGeometry(0.21, 0.02, 0.01)), this.eyeMat, head, [0, 0.015, 0.152]));
      for (const k of [-1, 1]) mesh(G(new THREE.SphereGeometry(0.008, 5, 4)), this.chrome, head, [k * 0.12, 0.015, 0.152]);
    } else {
      for (const k of [-1, 1]) {
        mesh(cyl(0.034, 0.038, 0.045, 12), this.chrome, head, [k * 0.062, 0.01, 0.13], [Math.PI / 2, 0, 0]);
        eyes.push(mesh(G(new THREE.CircleGeometry(0.029, 14)), this.eyeMat, head, [k * 0.062, 0.01, 0.153]));
      }
      mesh(metalBox(0.05, 0.022, 0.03, 0.005, 9), mats[M_METAL], head, [0, 0.01, 0.135]);
    }
    const jaw = new THREE.Group(); jaw.position.set(0, -0.085, 0.08); head.add(jaw);
    mesh(metalBox(0.11, 0.04, 0.06, 0.008, 11), mats[M_METAL], jaw, [0, -0.012, 0.02]);
    for (let i = 0; i < 4; i++) mesh(G(new THREE.BoxGeometry(0.075, 0.004, 0.004)), this.rubber, jaw, [0, -0.024 + i * 0.008, 0.051]);
    mesh(G(new THREE.BoxGeometry(0.08, 0.02, 0.01)), mats[M_GLOW], head, [0, -0.08, 0.085]);
    let dish: THREE.Group | null = null, bulb: THREE.Mesh | null = null;
    if (L.top === 'antenna') {
      const an = new THREE.Group(); an.position.set(0.06, 0.11, -0.03); an.rotation.z = -0.15; head.add(an);
      mesh(cyl(0.02, 0.026, 0.03, 8), mats[M_METAL], an);
      mesh(cyl(0.004, 0.006, 0.24, 5), this.chrome, an, [0, 0.13, 0]);
      for (let i = 0; i < 3; i++) mesh(G(new THREE.TorusGeometry(0.012, 0.003, 4, 10)), this.brass, an, [0, 0.04 + i * 0.012, 0], [Math.PI / 2, 0, 0]);
      bulb = mesh(G(new THREE.SphereGeometry(0.016, 8, 6)), this.bulbMat, an, [0, 0.26, 0]);
    } else if (L.top === 'tubes') {
      for (const k of [-1, 1]) { mesh(cyl(0.024, 0.026, 0.02, 8), this.chrome, head, [k * 0.045, 0.12, -0.02]); mesh(cyl(0.02, 0.02, 0.07, 8), mats[M_GLOW], head, [k * 0.045, 0.165, -0.02]); mesh(G(new THREE.SphereGeometry(0.02, 8, 4, 0, TAU, 0, Math.PI / 2)), mats[M_GLOW], head, [k * 0.045, 0.2, -0.02]); }
    } else if (L.top === 'dish') {
      dish = new THREE.Group(); dish.position.set(0, 0.12, -0.02); head.add(dish);
      mesh(cyl(0.008, 0.012, 0.07, 6), this.chrome, dish, [0, 0.03, 0]);
      mesh(G(new THREE.SphereGeometry(0.075, 14, 6, 0, TAU, 0, Math.PI * 0.32)), this.dishMat, dish, [0, 0.13, 0.02], [Math.PI * 0.62, 0, 0]);
      mesh(cyl(0.003, 0.003, 0.07, 4), this.chrome, dish, [0, 0.12, 0.05], [Math.PI * 0.62, 0, 0]);
    } else {
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4, g = G(new THREE.OctahedronGeometry(1, 0)); g.scale(0.022, 0.07 + hash01(i, 3, 3) * 0.05, 0.022); mesh(g, mats[M_GLOW], head, [Math.cos(a) * 0.06, 0.13, Math.sin(a) * 0.05 - 0.02], [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4]); }
    }
    // ---- arms: loose stones held by the field, joined by hydraulic pistons
    const arms: Arm[] = [], armX = 0.37 * bb;
    for (const k of [1, -1]) {
      const root = new THREE.Group(); root.position.set(k * armX, 0.64, 0); model.add(root);
      mesh(rk(400 + k, [0.1 * ab, 0.095 * ab, 0.1 * ab], 2, 0.2), mats, root);
      mesh(G(projUV(new THREE.SphereGeometry(0.09 * ab, 10, 5, 0, TAU, 0, Math.PI / 2), TS)), mats[M_METAL], root, [k * 0.02, 0.025, 0], [0, 0, -k * 0.5]);
      const upper = new THREE.Group(); upper.position.set(k * 0.03, -0.15, 0); root.add(upper);
      mesh(rk(410 + k, [0.065 * ab, 0.095 * ab, 0.065 * ab], 2, 0.2), mats, upper);
      const fore = new THREE.Group(); fore.position.set(0, -0.17, 0.01); upper.add(fore);
      mesh(rk(420 + k, [0.08 * ab, 0.11 * ab, 0.08 * ab], 2, 0.18), mats, fore);
      mesh(G(new THREE.TorusGeometry(0.078 * ab, 0.013, 5, 16)), mats[M_METAL], fore, [0, 0.03, 0], [Math.PI / 2, 0, 0]);
      const hand = new THREE.Group(); hand.position.set(0, -0.18, 0.02); fore.add(hand);
      if (L.arms === 'fists') {
        mesh(rk(430 + k, [0.105 * ab, 0.095 * ab, 0.105 * ab], 2, 0.16), mats, hand);
        mesh(metalBox(0.15 * ab, 0.035, 0.05, 0.008, 12), mats[M_METAL], hand, [0, -0.01, 0.075 * ab]);
        for (let i = 0; i < 4; i++) mesh(cyl(0.012, 0.012, 0.012, 6), this.chrome, hand, [(i - 1.5) * 0.034 * ab, -0.01, 0.1 * ab], [Math.PI / 2, 0, 0]);
      } else if (L.arms === 'claws') {
        mesh(rk(430 + k, [0.07 * ab, 0.06 * ab, 0.07 * ab], 2, 0.16), mats, hand);
        mesh(cyl(0.05 * ab, 0.045 * ab, 0.05, 10), mats[M_METAL], hand, [0, -0.05, 0]);
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * TAU + (k > 0 ? 0 : Math.PI / 3), prong = new THREE.Group(); prong.position.set(Math.cos(a) * 0.035, -0.07, Math.sin(a) * 0.035); prong.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); hand.add(prong);
          mesh(metalBox(0.022, 0.08, 0.022, 0.005, 13 + i), mats[M_METAL], prong, [0, -0.04, 0]);
          const tip = G(new THREE.ConeGeometry(0.012, 0.045, 5)); tip.rotateX(Math.PI); mesh(tip, this.chrome, prong, [0, -0.1, 0]);
        }
      } else {
        const hb = new THREE.BoxGeometry(0.17 * ab, 0.12 * ab, 0.15 * ab); projUV(hb); G(hb);
        mesh(hb, [mats[M_HAZ], mats[M_HAZ], mats[M_METAL], mats[M_METAL], mats[M_HAZ], mats[M_HAZ]], hand, [0, -0.03, 0]);
        mesh(cyl(0.035, 0.035, 0.06, 8), this.chrome, hand, [0, 0.05, 0]);
      }
      // pistons span each gap; their length follows the gap every frame
      const pist: Arm['pist'] = [];
      for (const [from, to] of [[root, upper], [upper, fore], [fore, hand]] as const) {
        const g = new THREE.Group(); from.add(g);
        mesh(cyl(0.022, 0.022, 0.45, 8), this.rubber, g, [0, 0.27, 0]);
        mesh(cyl(0.011, 0.011, 1, 6), this.chrome, g, [0, 0.5, 0]);
        g.userData.z = -0.035; pist.push({ g, to });
      }
      arms.push({ root, upper, fore, hand, pist, k });
    }
    // ---- loose stones on tilted orbits
    const stones: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const s = 0.025 + hash01(i, 3, 2) * 0.03, m = mesh(rk(500 + i, [s, s * 1.2, s], 1, 0.3), mats, model);
      m.userData = { s0: 1, a: (i / 5) * TAU, r: 0.55 + hash01(i, 5, 2) * 0.2, y: 0.35 + hash01(i, 7, 2) * 0.6, sp: 0.4 + hash01(i, 9, 2) * 0.3, tilt: (hash01(i, 11, 2) - 0.5) * 0.7, rot: new THREE.Vector3(hash01(i, 1, 2), hash01(i, 2, 2), hash01(i, 4, 2)) };
      stones.push(m);
    }
    return { model, body, head, jaw, arms, eyes, rubble, stones, dish, bulb, exhaust, tex, geos, armX };
  }
  /** it starts small and grows with its field (level 1..6) */
  setGrowth(level: number) { this.growTo = clamp(0.72 + (level - 1) * 0.11, 0.72, 1.3); }
  /** reach toward a point: arms swing up, the jaw drops, the reactor flares */
  cast(at: THREE.Vector3) { this.castT = 1.1; this.castAt.copy(at); this.onCast?.(); }
  /** a little wave */
  wave() { this.waveT = 2.4; }
  update(dt: number, cam: THREE.Camera) {
    this.t += dt;
    const h = this.hatch, t = this.t, R = this.R;
    this.root.visible = h > 0.05;
    if (!R) return;
    this.grow += (this.growTo - this.grow) * Math.min(1, dt * 0.8);
    this.root.scale.setScalar(this.baseScale * this.grow);
    const c = Math.min(1, this.castT * 3);
    // idle business: come apart and click back together, spin the head, flex, juggle the stones
    this.actT -= dt;
    if (this.actT <= 0 && !this.act && h >= 1 && c === 0) { this.act = (['scatter', 'spin', 'flex', 'juggle'] as const)[Math.floor(Math.random() * 4)]; this.actK = 0; }
    let sc = 0, spin = 0, flex = 0, jug = 0;
    if (this.act) {
      this.actK += dt;
      const d = this.act === 'scatter' ? 1.8 : this.act === 'spin' ? 1.6 : this.act === 'flex' ? 1.8 : 2.4, u = this.actK / d;
      if (this.act === 'scatter') sc = Math.sin(Math.min(1, u) * Math.PI) ** 2;
      if (this.act === 'spin') spin = u < 1 ? (1 - Math.cos(u * Math.PI)) * Math.PI : 0;
      if (this.act === 'flex') flex = Math.sin(Math.min(1, u) * Math.PI) ** 0.6;
      if (this.act === 'juggle') jug = Math.sin(Math.min(1, u) * Math.PI);
      if (u >= 1) { this.act = null; this.actT = 4 + Math.random() * 6; }
    }
    // rise out of the rock, then hover
    const rise = clamp((h - 0.1) / 0.6, 0, 1);
    this.rig.position.y = (1 - rise) * -1.3 + rise * (0.42 + Math.sin(t * 1.2) * 0.06 + c * 0.08);
    this.rig.rotation.set(Math.sin(t * 0.8) * 0.04, 0, Math.sin(t * 1.0) * 0.05);
    this.ring.position.y = 0.06 - Math.sin(t * 1.2) * 0.04; this.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.05 + c * 0.5);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = rise * (0.35 + c * 0.45);
    // look (body turns a little, the floating head turns fully)
    const target = this.castT > 0 ? this.castAt : this.look;
    this.root.updateMatrixWorld();
    const lp = this.root.worldToLocal(target.clone());
    const wantYaw = clamp(Math.atan2(lp.x, lp.z), -1.2, 1.2), wantPitch = clamp(-Math.atan2(lp.y - 0.9, Math.hypot(lp.x, lp.z)) * 0.5, -0.35, 0.35);
    this.lookYaw = damp(this.lookYaw, wantYaw, 3, dt); this.lookPitch = damp(this.lookPitch, wantPitch, 3, dt);
    R.body.position.set(0, 0.5 + Math.sin(t * 1.7) * 0.012, -c * 0.03);
    R.body.rotation.set(c * 0.14 + Math.sin(t * 0.9) * 0.03 - flex * 0.1, this.lookYaw * 0.35, Math.sin(t * 1.1) * 0.03);
    R.head.position.set(0, 0.88 + Math.sin(t * 1.7 - 0.7) * 0.02 + sc * 0.14 + c * 0.03, 0.01 + c * 0.02);
    R.head.rotation.set(this.lookPitch - c * 0.12, this.lookYaw + spin, Math.sin(t * 0.6) * 0.07 + Math.sin(t * 9) * 0.03 * jug);
    R.jaw.rotation.x = c * 0.5 + flex * 0.25;
    // arms: hang and drift; reach when casting; one waves; both flex
    this.castT = Math.max(0, this.castT - dt);
    this.waveT = Math.max(0, this.waveT - dt);
    const wv = Math.min(1, this.waveT * 1.5) * (1 - c);
    for (const A of R.arms) {
      const k = A.k, pad = Math.sin(t * 1.3 + (k > 0 ? 0 : 2)), up = k > 0 ? wv : 0, jg = jug * Math.sin(t * 7 + (k > 0 ? 0 : Math.PI));
      A.root.position.set(k * (R.armX + sc * 0.16), 0.64 + Math.sin(t * 1.7 + k) * 0.015 + sc * 0.04, sc * 0.03);
      A.root.rotation.set(-c * 1.25 + pad * 0.07 - flex * 0.2 - jg * 0.4, 0, k * (0.1 + c * 0.2 + up * 2.4 + flex * 1.5));
      const gap = 1 + Math.sin(t * 2.3 + k) * 0.05 + c * 0.25 + sc * 0.6;
      A.upper.position.set(k * 0.03, -0.15 * gap, 0); A.fore.position.set(0, -0.17 * gap, 0.01); A.hand.position.set(0, -0.18 * gap, 0.02);
      A.fore.rotation.set(-c * 0.5 - flex * 1.7 - jg * 0.6 + pad * 0.05, 0, k * up * Math.sin(t * 9) * 0.35);
      A.hand.rotation.set(-c * 0.3, Math.sin(t * 0.7 + k) * 0.2 + flex * 0.4, 0);
      for (const p of A.pist) { const v = p.to.position, L = v.length(); p.g.position.set(0, 0, p.g.userData.z); p.g.quaternion.setFromUnitVectors(Y_UP, v.clone().normalize()); p.g.scale.set(1, L, 1); }
    }
    // rubble rides the coil; loose stones orbit; the dish sweeps; the antenna blinks; the tubes and exhausts work
    for (const m of R.rubble) { const u = m.userData; u.a += dt * u.sp * (1 + c * 2); m.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(t * 1.5 + u.a) * 0.02, Math.sin(u.a) * u.r); m.rotation.x += dt * 0.7; m.rotation.y += dt * 0.5; }
    const vis = clamp((h - 0.65) / 0.3, 0, 1);
    for (const s of R.stones) {
      const u = s.userData; u.a += dt * (u.sp + c * 3 + jug * 4);
      s.visible = vis > 0.01;
      const rr = u.r * (1 + c * 0.6 + sc * 0.3);
      s.position.set(Math.cos(u.a) * rr, u.y + Math.sin(u.a) * u.tilt * rr + jug * Math.abs(Math.sin(u.a * 2)) * 0.25, Math.sin(u.a) * rr);
      s.rotation.x += dt * u.rot.x * (1 + c * 5); s.rotation.y += dt * u.rot.y * (1 + c * 5);
      s.scale.setScalar(vis);
    }
    if (R.dish) R.dish.rotation.y = t * 0.9 + c * 3;
    if (R.bulb) R.bulb.visible = Math.sin(t * 4) > 0.2 || c > 0;
    this.smokeT -= dt * (1 + c * 6);
    if (this.smokeT <= 0 && h >= 1) {
      this.smokeT = 0.5 + Math.random() * 1.2;
      const p = new THREE.Vector3(), tip = R.exhaust[Math.floor(Math.random() * R.exhaust.length)];
      tip.getWorldPosition(p);
      this.fx.burst(p.x, p.y, p.z, 1 + Math.round(c * 2), c > 0 ? 0x9a8a7a : 0x6a6660, { speed: 0.15, up: 0.5, size: 2, life: 1.1, grav: -0.4 });
    }
    // eyes: dark until it wakes, then a slow shutter blink
    this.blinkT -= dt;
    let lid = 0;
    if (this.blinkT < 0.18) lid = Math.sin(clamp(this.blinkT / 0.18, 0, 1) * Math.PI);
    if (this.blinkT <= 0) this.blinkT = 3 + Math.random() * 4;
    if (h < 0.8) lid = 1 - clamp((h - 0.6) / 0.2, 0, 1);
    for (const e of R.eyes) e.scale.set(1, Math.max(0.08, 1 - lid), 1);
    this.eyeMat.color.set(mixHex(this.look_.glow, 0xffffff, 0.55)).multiplyScalar(1.2 + c * 1.4);
    this.glowU.value = 0.7 + c * 2.0 + Math.max(0, Math.sin(t * 2.0)) * 0.3 + (Math.random() < 0.03 ? 0.4 : 0) + (h > 0.7 && h < 1 ? (1 - h) * 6 : 0);
    if (c > 0.3 && Math.random() < dt * 30) {
      const p = new THREE.Vector3(0, -0.05, 0.05);
      R.arms[Math.random() < 0.5 ? 0 : 1].hand.localToWorld(p);
      const g = new THREE.Color(this.look_.glow).multiplyScalar(2.2);
      this.fx.glow.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 0.6, 0.6, (Math.random() - 0.5) * 0.6, g, 1, 2.5, 0.6, -0.3, 1);
    }
    void cam;
  }
  /** world position of the head (for beams) */
  headPos(out = new THREE.Vector3()) { out.set(0, 0, 0.1); return this.R ? this.R.head.localToWorld(out) : this.root.getWorldPosition(out); }
}
const Y_UP = new THREE.Vector3(0, 1, 0);
