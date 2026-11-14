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
/** chassis parts the model can show, by skill id (skills.ts). 'head' is always there. */
export const CHASSIS = ['head', 'torso', 'armR', 'armL', 'coil', 'plating1', 'plating2'] as const;
export type Work = 'drill' | 'dig' | 'intake' | 'siphon' | 'graft' | 'grit' | 'convert' | null;
interface Arm { id: 'armR' | 'armL'; root: THREE.Group; upper: THREE.Group; fore: THREE.Group; hand: THREE.Group; pist: { g: THREE.Group; to: THREE.Group }[]; k: number; punch: number; spin: number }
interface Rig {
  model: THREE.Group; body: THREE.Group | null; head: THREE.Group; jaw: THREE.Group; arms: Arm[]; eyes: THREE.Mesh[]; rubble: THREE.Mesh[]; stones: THREE.Mesh[];
  dish: THREE.Group | null; bulb: THREE.Mesh | null; exhaust: THREE.Object3D[]; geos: THREE.BufferGeometry[]; armX: number;
  /** what flies in when a part is bought: wrappers for the moving parts, the plates themselves for plating */
  parts: Record<string, THREE.Object3D[]>; plates: THREE.Mesh[];
}
interface Asm { obj: THREE.Object3D; part: string; pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3; from: THREE.Vector3; spin: THREE.Vector3; t: number; delay: number; dur: number }
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _qa = new THREE.Quaternion(), _ea = new THREE.Euler();
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class VeyrChild {
  readonly root = new THREE.Group();
  private rig = new THREE.Group();
  private R: Rig | null = null;
  private mats: THREE.Material[];
  private texs: THREE.Texture[] = [];
  private chrome: THREE.MeshPhongMaterial; private brass: THREE.MeshPhongMaterial; private rubber: THREE.MeshLambertMaterial;
  private eyeMat: THREE.MeshBasicMaterial; private dishMat: THREE.MeshPhongMaterial; private bulbMat: THREE.MeshBasicMaterial; private plateMat: THREE.MeshLambertMaterial;
  private glowU = { value: 0.6 };
  private ring: THREE.Mesh;
  private t = 0; private blinkT = 3; private castT = 0; private castAt = new THREE.Vector3(); private smokeT = 1;
  private waveT = 0; private actT = 4; private act: 'scatter' | 'spin' | 'flex' | 'juggle' | null = null; private actK = 0;
  private baseScale: number; private grow = 0.72; private growTo = 0.72;
  hatch = 0; // 0 sealed .. 1 out and afloat
  look = new THREE.Vector3();
  /** when set, the head follows this instead of look (the player's aim) */
  aim: THREE.Vector3 | null = null;
  private lookYaw = 0; private lookPitch = 0;
  private look_: BabyLook;
  onCast?: () => void;
  // ---- the player's body (player.ts drives these)
  /** owned chassis parts; null shows the whole machine (the mirror pool, story scenes) */
  parts: Set<string> | null = null;
  private asm: Asm[] = [];
  /** a part finished flying in and clicked into place */
  onAssembled?: (part: string, at: THREE.Vector3) => void;
  /** lean of the whole rig with acceleration (x: pitch, y: roll) */
  lean = new THREE.Vector2();
  /** arms raised over the head to carry something (0..1); big: both arms */
  hold = 0; holdBig = false; private holdK = 0;
  /** the current job: drill, dig, intake... (null when idle) */
  work: Work = null; private workK = 0; private workKind: Work = null;
  private butt = -1; private thr = -1; private wig = 0;
  private jolt = new THREE.Vector3(); private joltV = new THREE.Vector3();
  private flashC = new THREE.Color(); private flashK = 0;
  /** 0 intact .. 1 wrecked: sparks and smoke */
  damage = 0;
  /** blown apart (hidden until reassembled) */
  broken = false;
  private headY = 0.88; private hoverH = 0.42; private sparkT = 1;
  constructor(readonly fx: Fx, scale = 1.25, look?: BabyLook, opts: { grown?: boolean; parts?: Iterable<string> } = {}) {
    this.look_ = look ?? loadLook();
    this.baseScale = scale;
    if (opts.grown) this.grow = this.growTo = 1;
    if (opts.parts) this.parts = new Set(['head', ...opts.parts]);
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
  // ---- x-ray: a dithered silhouette in the fx layer, drawn only where something stands between it and the camera
  private ver = 0; private ghostVer = -1;
  private ghostRoot: THREE.Group | null = null; private ghostMat: THREE.ShaderMaterial | null = null;
  private ghosts: { src: THREE.Mesh; g: THREE.Mesh }[] = [];
  attachGhost(fxScene: THREE.Scene) {
    this.ghostRoot = new THREE.Group(); fxScene.add(this.ghostRoot);
    this.ghostMat = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color(this.look_.glow) }, uA: { value: 0.75 }, uPull: { value: 0.32 } },
      vertexShader: `uniform float uPull;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); wp.xyz += normalize(cameraPosition - wp.xyz) * uPull; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform vec3 uCol; uniform float uA;
void main() { vec2 p = floor(gl_FragCoord.xy); if (mod(p.x + p.y, 2.0) < 0.5) discard; gl_FragColor = vec4(uCol * uA, uA); }`,
      transparent: true, depthWrite: false, depthFunc: THREE.GreaterDepth,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
  }
  /** copy the golem's pose onto its silhouette (call after the root is placed for the frame) */
  syncGhost(show = true) {
    const G = this.ghostRoot, R = this.R;
    if (!G || !R || !this.ghostMat) return;
    G.visible = show && this.root.visible;
    if (!G.visible) return;
    if (this.ghostVer !== this.ver) {
      this.ghostVer = this.ver;
      for (const x of this.ghosts) x.g.removeFromParent();
      this.ghosts = [];
      R.model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const g = new THREE.Mesh(m.geometry, this.ghostMat!);
        g.matrixAutoUpdate = false; g.matrixWorldAutoUpdate = false; g.frustumCulled = false;
        G.add(g); this.ghosts.push({ src: m, g });
      });
      (this.ghostMat.uniforms.uCol.value as THREE.Color).set(this.look_.glow).multiplyScalar(1.3);
    }
    this.root.updateMatrixWorld(true);
    for (const { src, g } of this.ghosts) {
      let v = true; for (let o: THREE.Object3D | null = src; o && o !== this.root; o = o.parent) if (!o.visible) { v = false; break; }
      g.visible = v;
      if (v) g.matrixWorld.copy(src.matrixWorld);
    }
  }
  /** repaint for a new look and rebuild */
  setLook(L: BabyLook) {
    this.look_ = { ...L };
    this.texs.forEach((t) => t.dispose());
    const tex = [paintRock(L, 0), paintRock(L, 1), paintRock(L, 2), paintGlow(L), paintMetal(L.metal), paintMetal(L.metal, true)];
    tex.forEach((t, i) => { (this.mats[i] as THREE.MeshLambertMaterial).map = t; this.mats[i].needsUpdate = true; });
    const plate = paintPlate(L); this.plateMat.map = plate; this.plateMat.needsUpdate = true;
    this.texs = [...tex, plate];
    this.eyeMat.color.set(mixHex(L.glow, 0xffffff, 0.55));
    (this.ring.material as THREE.MeshBasicMaterial).color.set(L.glow).multiplyScalar(1.4);
    this.rebuild();
  }
  private rebuild() {
    if (this.R) { this.R.model.removeFromParent(); this.R.geos.forEach((g) => g.dispose()); }
    this.ver++;
    this.asm = [];
    this.R = this.build(this.look_);
    this.rig.add(this.R.model);
  }
  /** show exactly these chassis parts. New ones fly in from all around and click into place (unless instant);
   *  returns the parts that were added */
  setParts(list: Iterable<string>, animate = true): string[] {
    const next = new Set<string>(['head']);
    for (const p of list) if ((CHASSIS as readonly string[]).includes(p)) next.add(p);
    const prev = this.parts;
    if (prev && prev.size === next.size && [...next].every((p) => prev.has(p))) return [];
    const added = prev ? [...next].filter((p) => !prev.has(p)) : [];
    this.parts = next;
    this.rebuild();
    if (!prev) { // snap the layout to the new body at once
      this.headY = next.has('torso') ? 0.88 : 0.36; this.hoverH = next.has('torso') ? 0.42 : 0.2;
    }
    if (animate && added.length) this.assemble(added);
    return added;
  }
  /** a fixed size for the playable golem (no growing with the field) */
  setScale(s: number) { this.baseScale = s; this.grow = this.growTo = 1; }
  has(p: string) { return !this.parts || this.parts.has(p); }
  private assemble(ids: string[], scatter = false) {
    const R = this.R; if (!R) return;
    let n = 0;
    for (const id of ids) for (const obj of R.parts[id] ?? []) {
      const a = Math.random() * TAU, el = 0.25 + Math.random() * 0.9, d = scatter ? 0.9 + Math.random() * 0.8 : 1.6 + Math.random() * 1.2;
      this.asm.push({
        obj, part: id, pos: obj.position.clone(), quat: obj.quaternion.clone(), scale: obj.scale.clone(),
        from: new THREE.Vector3(Math.cos(a) * Math.cos(el) * d, Math.sin(el) * d + 0.3, Math.sin(a) * Math.cos(el) * d),
        spin: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9),
        t: 0, delay: n * (scatter ? 0.06 : 0.12) + (scatter ? Math.random() * 0.2 : 0), dur: scatter ? 0.5 : 0.62,
      });
      obj.visible = false;
      n++;
    }
  }
  private build(L: BabyLook): Rig {
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
    const parts: Record<string, THREE.Object3D[]> = {}, plates: THREE.Mesh[] = [];
    const wrap = (id: string) => { const w = new THREE.Group(); model.add(w); (parts[id] ??= []).push(w); return w; };
    const has = (id: string) => this.has(id);
    const torso = has('torso');
    /** a riveted plate bolted onto a part (plating skills); it flies in on its own */
    const plateOn = (id: string, parent: THREE.Object3D, w: number, h: number, d: number, p: [number, number, number], r: [number, number, number], haz = false) => {
      const m = mesh(metalBox(w, h, d, Math.min(0.01, d * 0.3), 20 + plates.length), haz ? mats[M_HAZ] : mats[M_METAL], parent, p, r);
      const big = Math.max(w, h, d), rv = G(new THREE.SphereGeometry(Math.max(0.005, big * 0.045), 5, 4));
      const face = w <= d && w <= h ? 'x' : h <= w && h <= d ? 'y' : 'z';
      for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const q: [number, number, number] = face === 'x' ? [w * 0.5, v * h * 0.36, u * d * 0.36] : face === 'y' ? [u * w * 0.38, h * 0.5, v * d * 0.36] : [u * w * 0.38, v * h * 0.36, d * 0.5];
        mesh(rv, this.chrome, m, q);
        if (face === 'x') mesh(rv, this.chrome, m, [-q[0], q[1], q[2]]);
      }
      plates.push(m); (parts[id] ??= []).push(m);
      return m;
    };
    // ---- gravity coil (or, without it, just the rubble the field holds under the lowest part)
    if (has('coil') && torso) {
      const coil = new THREE.Group(); coil.position.y = 0.2; wrap('coil').add(coil);
      for (let i = 0; i < 4; i++) mesh(G(new THREE.TorusGeometry(0.12 - i * 0.012, 0.016, 6, 22)), this.brass, coil, [0, -i * 0.028, 0], [Math.PI / 2, 0, 0]);
      mesh(cyl(0.04, 0.06, 0.12, 8), mats[M_METAL], coil, [0, -0.03, 0]);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; mesh(G(new THREE.BoxGeometry(0.012, 0.09, 0.012)), this.chrome, coil, [Math.cos(a) * 0.125, -0.04, Math.sin(a) * 0.125]); }
    }
    const rubble: THREE.Mesh[] = [];
    const nr = torso ? 4 : 6;
    for (let i = 0; i < nr; i++) { const s = (torso ? 0.035 : 0.02) + hash01(i, 4, 1) * (torso ? 0.03 : 0.016); const m = mesh(rk(300 + i, [s, s * 0.8, s], 1, 0.25), mats, model); m.userData = { a: (i / nr) * TAU, r: 0.2 + hash01(i, 2, 1) * 0.05, y: 0.12 + hash01(i, 3, 1) * 0.08, sp: 0.6 + hash01(i, 5, 1) * 0.4 }; rubble.push(m); }
    // ---- the chest: a boulder with a riveted plate, a porthole onto the reactor, a tube pack and exhausts behind
    let body: THREE.Group | null = null;
    const tw: [number, number, number] = [0.3 * bb, 0.27, 0.24 * bb];
    const exhaust: THREE.Object3D[] = [];
    if (torso) {
      body = new THREE.Group(); body.position.y = 0.5; wrap('torso').add(body);
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
      for (const k of [-1, 1]) {
        const ex = new THREE.Group(); ex.position.set(k * 0.15 * bb, 0.14, -tw[2] * 0.6); ex.rotation.set(-0.5, 0, k * 0.2); body.add(ex);
        mesh(cyl(0.016, 0.02, 0.14, 8), this.chrome, ex, [0, 0.05, 0]);
        mesh(cyl(0.022, 0.022, 0.02, 8), this.rubber, ex, [0, 0.125, 0]);
        const tip = new THREE.Object3D(); tip.position.set(0, 0.14, 0); ex.add(tip); exhaust.push(tip);
      }
      // bolted brackets on the flanks (the arm sockets)
      for (const k of [-1, 1]) mesh(metalBox(0.03, 0.09, 0.07, 0.006, 5 + k), mats[M_METAL], body, [k * tw[0] * 0.93, -0.04, 0.03], [0, 0, k * -0.15]);
      if (has('plating1')) for (const k of [-1, 1]) plateOn('plating1', body, 0.035, 0.17, 0.2, [k * tw[0] * 1.02, 0.03, -0.01], [0, 0, k * -0.12]);
      if (has('plating2')) {
        plateOn('plating2', body, 0.27 * bb, 0.075, 0.035, [0, -0.19, tw[2] * 0.86], [0.42, 0, 0], true);
        plateOn('plating2', body, 0.3 * bb, 0.19, 0.035, [0, -0.03, -tw[2] * 1.0], [-0.12, 0, 0]);
      }
    }
    // ---- the head: a rock floating free of the body, with an Earth-made face
    const head = new THREE.Group(); head.position.y = this.headY; wrap('head').add(head);
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
    if (has('plating1') && torso) plateOn('plating1', head, 0.19, 0.03, 0.15, [0, 0.1, -0.035], [-0.15, 0, 0]);
    if (has('plating2') && torso) plateOn('plating2', head, 0.24, 0.035, 0.055, [0, 0.085, 0.12], [-0.45, 0, 0]);
    // ---- arms: loose stones held by the field, joined by hydraulic pistons. The right arm is -x (it faces +z)
    const arms: Arm[] = [], armX = 0.37 * bb;
    for (const k of [-1, 1]) {
      const id = k < 0 ? 'armR' : 'armL';
      if (!torso || !has(id)) continue;
      const root = new THREE.Group(); root.position.set(k * armX, 0.64, 0); wrap(id).add(root);
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
      if (has('plating1')) plateOn('plating1', root, 0.17 * ab, 0.035, 0.15 * ab, [k * 0.03, 0.1, 0], [0, 0, k * -0.45]);
      if (has('plating2')) plateOn('plating2', fore, 0.035, 0.12, 0.12 * ab, [k * 0.075 * ab, -0.02, 0.01], [0, 0, 0]);
      arms.push({ id, root, upper, fore, hand, pist, k, punch: -1, spin: 0 });
    }
    // ---- loose stones on tilted orbits (the field has a body to hold them round)
    const stones: THREE.Mesh[] = [];
    if (torso) {
      const sw = parts.torso![0];
      for (let i = 0; i < 5; i++) {
        const s = 0.025 + hash01(i, 3, 2) * 0.03, m = mesh(rk(500 + i, [s, s * 1.2, s], 1, 0.3), mats, sw);
        m.userData = { s0: 1, a: (i / 5) * TAU, r: 0.55 + hash01(i, 5, 2) * 0.2, y: 0.35 + hash01(i, 7, 2) * 0.6, sp: 0.4 + hash01(i, 9, 2) * 0.3, tilt: (hash01(i, 11, 2) - 0.5) * 0.7, rot: new THREE.Vector3(hash01(i, 1, 2), hash01(i, 2, 2), hash01(i, 4, 2)) };
        stones.push(m);
      }
    }
    return { model, body, head, jaw, arms, eyes, rubble, stones, dish, bulb, exhaust, geos, armX, parts, plates };
  }
  /** it starts small and grows with its field (level 1..6); the playable golem keeps a fixed size */
  setGrowth(level: number) { if (this.parts) return; this.growTo = clamp(0.72 + (level - 1) * 0.11, 0.72, 1.3); }
  /** reach toward a point: arms swing up, the jaw drops, the reactor flares */
  cast(at: THREE.Vector3) { this.castT = 1.1; this.castAt.copy(at); this.onCast?.(); }
  /** a little wave */
  wave() { this.waveT = 2.4; }
  // ---- combat and work (player.ts)
  get arms() { return this.R?.arms.map((a) => a.id) ?? []; }
  /** swing a piston punch with an arm (R or L; the free one by default). Returns the arm used */
  punch(side?: 'armR' | 'armL'): 'armR' | 'armL' | null {
    const A = this.R?.arms ?? [];
    const arm = (side && A.find((a) => a.id === side)) || A.find((a) => a.punch < 0) || A[0];
    if (!arm) return null;
    arm.punch = 0;
    return arm.id;
  }
  /** a head-only lunge */
  headbutt() { this.butt = 0; }
  /** swing whatever is held overhead forward */
  throwSwing() { this.thr = 0; }
  /** knocked about by a blow */
  hurt(strength = 1) {
    this.joltV.set((Math.random() - 0.5) * 7 * strength, 0, (Math.random() - 0.5) * 7 * strength);
    this.flash(0xff4a3a, 1);
    if (this.R && Math.random() < 0.35 * strength) this.dent();
  }
  /** lens flash (events, damage, level-ups) */
  flash(col: number, k = 1) { this.flashC.set(col); this.flashK = Math.max(this.flashK, k); }
  /** a happy wiggle */
  wiggle() { this.wig = 1.3; this.flash(0xffffff, 0.8); if (!this.act && this.hatch >= 1) { this.act = this.R?.stones.length ? 'juggle' : 'spin'; this.actK = 0; } }
  /** bend a plate on its bolts */
  dent() {
    const P = this.R?.plates; if (!P || !P.length) return;
    const p = P[Math.floor(Math.random() * P.length)];
    p.rotation.x += (Math.random() - 0.5) * 0.35; p.rotation.z += (Math.random() - 0.5) * 0.35; p.scale.multiply(_a.set(1 - Math.random() * 0.12, 1, 1 - Math.random() * 0.12));
  }
  /** blown apart: the pieces' world positions and sizes, for debris; the model hides until reassemble() */
  shatter(): { p: THREE.Vector3; size: number; metal: boolean }[] {
    const R = this.R, out: { p: THREE.Vector3; size: number; metal: boolean }[] = [];
    if (!R) return out;
    const s = this.baseScale * this.grow;
    R.model.updateMatrixWorld(true);
    out.push({ p: R.head.getWorldPosition(new THREE.Vector3()), size: 0.13 * s, metal: false });
    if (R.body) { const b = R.body.getWorldPosition(new THREE.Vector3()); out.push({ p: b, size: 0.24 * s, metal: false }, { p: b.clone(), size: 0.12 * s, metal: true }); }
    for (const A of R.arms) for (const o of [A.root, A.fore, A.hand]) out.push({ p: o.getWorldPosition(new THREE.Vector3()), size: 0.09 * s, metal: false });
    for (const p of R.plates) out.push({ p: p.getWorldPosition(new THREE.Vector3()), size: 0.08 * s, metal: true });
    for (const m of R.rubble) out.push({ p: m.getWorldPosition(new THREE.Vector3()), size: 0.04 * s, metal: false });
    this.broken = true;
    return out;
  }
  /** come back together: every part flies in from close by */
  reassemble() { this.broken = false; this.rebuild(); this.assemble([...(this.parts ?? CHASSIS)], true); this.flash(0xffffff, 1.5); }
  /** world points: lens, jaw (the intake), a hand, the carry point over the head */
  headPos(out = new THREE.Vector3()) { out.set(0, 0, 0.1); return this.R ? this.R.head.localToWorld(out) : this.root.getWorldPosition(out); }
  mouthPos(out = new THREE.Vector3()) { out.set(0, -0.03, 0.08); return this.R ? this.R.jaw.localToWorld(out) : this.root.getWorldPosition(out); }
  handPos(side: 'armR' | 'armL', out = new THREE.Vector3()) {
    const A = this.R?.arms.find((a) => a.id === side) ?? this.R?.arms[0];
    if (!A) return this.mouthPos(out);
    out.set(0, -0.06, 0.06); return A.hand.localToWorld(out);
  }
  holdPos(big: boolean, out = new THREE.Vector3()) {
    const R = this.R;
    if (!R || !R.arms.length) { out.set(0, 0.25, 0.1); return R ? R.head.localToWorld(out) : this.root.getWorldPosition(out); }
    if (big && R.arms.length > 1) { R.arms[0].hand.localToWorld(out.set(0, -0.06, 0)); R.arms[1].hand.localToWorld(_b.set(0, -0.06, 0)); return out.add(_b).multiplyScalar(0.5).add(_a.set(0, 0.06 * this.baseScale, 0)); }
    const A = R.arms.find((a) => a.id === 'armR') ?? R.arms[0];
    return A.hand.localToWorld(out.set(0, -0.1, 0.03));
  }
  update(dt: number, cam: THREE.Camera) {
    this.t += dt;
    const h = this.hatch, t = this.t, R = this.R;
    this.root.visible = h > 0.05 && !this.broken;
    if (!R) return;
    this.grow += (this.growTo - this.grow) * Math.min(1, dt * 0.8);
    this.root.scale.setScalar(this.baseScale * this.grow);
    const c = Math.min(1, this.castT * 3);
    const torso = !!R.body;
    // what it's busy with
    if (this.work) this.workKind = this.work;
    this.workK = damp(this.workK, this.work ? 1 : 0, 10, dt);
    this.holdK = damp(this.holdK, this.hold, 12, dt);
    const wk = this.workK, kind = this.workKind;
    const busy = wk > 0.05 || this.holdK > 0.05 || R.arms.some((a) => a.punch >= 0) || this.butt >= 0 || this.thr >= 0;
    // idle business: come apart and click back together, spin the head, flex, juggle the stones
    this.actT -= dt;
    if (this.actT <= 0 && !this.act && h >= 1 && c === 0 && !busy && this.wig <= 0) {
      const opts: ('scatter' | 'spin' | 'flex' | 'juggle')[] = ['spin'];
      if (torso) opts.push('scatter', 'juggle'); if (R.arms.length) opts.push('flex');
      this.act = opts[Math.floor(Math.random() * opts.length)]; this.actK = 0;
    }
    if (busy && this.act && this.act !== 'juggle') { this.act = null; this.actT = 3 + Math.random() * 4; }
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
    // springs: a blow knocks the rig about; a happy wiggle
    this.joltV.addScaledVector(this.jolt, -260 * dt); this.joltV.multiplyScalar(Math.exp(-dt * 9)); this.jolt.addScaledVector(this.joltV, dt);
    this.wig = Math.max(0, this.wig - dt);
    const wg = Math.sin(this.wig * 24) * Math.min(1, this.wig * 2) * 0.3;
    // rise out of the rock, then hover (a bare head floats low)
    this.hoverH = damp(this.hoverH, torso ? 0.42 : 0.2, 3, dt);
    this.headY = damp(this.headY, torso ? 0.88 : 0.36, 4, dt);
    const rise = clamp((h - 0.1) / 0.6, 0, 1);
    this.rig.position.y = (1 - rise) * -1.3 + rise * (this.hoverH + Math.sin(t * 1.2) * (torso ? 0.06 : 0.035) + c * 0.08 + Math.abs(wg) * 0.15);
    this.rig.rotation.set(Math.sin(t * 0.8) * 0.04 + this.lean.x + this.jolt.x, wg, Math.sin(t * 1.0) * 0.05 + this.lean.y + this.jolt.z);
    this.ring.position.y = 0.06 - Math.sin(t * 1.2) * 0.04; this.ring.scale.setScalar((torso ? 1 : 0.45) * (1 + Math.sin(t * 3) * 0.05 + c * 0.5));
    (this.ring.material as THREE.MeshBasicMaterial).opacity = rise * (0.35 + c * 0.45);
    // look (body turns a little, the floating head turns fully)
    const target = this.castT > 0 ? this.castAt : this.aim ?? this.look;
    this.root.updateMatrixWorld();
    const lp = this.root.worldToLocal(_a.copy(target));
    const hy = this.headY * 0.5 + 0.45;
    const wantYaw = clamp(Math.atan2(lp.x, lp.z), -1.2, 1.2), wantPitch = clamp(-Math.atan2(lp.y - hy, Math.hypot(lp.x, lp.z)) * 0.5, -0.35, 0.45);
    this.lookYaw = damp(this.lookYaw, wantYaw, 5, dt); this.lookPitch = damp(this.lookPitch, wantPitch, 5, dt);
    // punches twist the chest into the blow
    let twist = 0;
    for (const A of R.arms) if (A.punch >= 0) twist += A.k * -0.3 * Math.sin(Math.min(1, A.punch * 1.6) * Math.PI);
    const bend = (kind === 'drill' || kind === 'dig' || kind === 'graft' || kind === 'convert') ? 0.22 * wk : 0;
    if (R.body) {
      R.body.position.set(0, 0.5 + Math.sin(t * 1.7) * 0.012, -c * 0.03);
      R.body.rotation.set(c * 0.14 + Math.sin(t * 0.9) * 0.03 - flex * 0.1 + bend, this.lookYaw * 0.35 + twist, Math.sin(t * 1.1) * 0.03);
    }
    // the head: lunges for a headbutt, tips down to work, jaw wide for the intake
    let bt = 0;
    if (this.butt >= 0) { this.butt += dt / 0.32; bt = Math.sin(Math.min(1, this.butt) * Math.PI) ** 0.7; if (this.butt >= 1) this.butt = -1; }
    const mouthy = kind === 'intake' || kind === 'siphon' || kind === 'grit';
    const headWork = !R.arms.length && (kind === 'drill' || kind === 'dig');
    const shake = (headWork || (mouthy && !torso)) ? Math.sin(t * 47) * 0.02 * wk : 0;
    R.head.position.set(shake, this.headY + Math.sin(t * 1.7 - 0.7) * 0.02 + sc * 0.14 + c * 0.03 - (headWork ? 0.06 * wk : 0), 0.01 + c * 0.02 + bt * 0.24 + (headWork ? 0.06 * wk : 0));
    R.head.rotation.set(this.lookPitch - c * 0.12 + bt * 0.55 + (mouthy || headWork ? 0.35 * wk : 0), this.lookYaw + spin, Math.sin(t * 0.6) * 0.07 + Math.sin(t * 9) * 0.03 * jug + shake * 4);
    R.jaw.rotation.x = c * 0.5 + flex * 0.25 + (mouthy ? (0.75 + Math.sin(t * 19) * 0.12) * wk : 0) + bt * 0.3;
    // arms: hang and drift; reach when casting; one waves; both flex. Then work, carrying, throwing, punching
    this.castT = Math.max(0, this.castT - dt);
    this.waveT = Math.max(0, this.waveT - dt);
    const wv = Math.min(1, this.waveT * 1.5) * (1 - c);
    const waver = R.arms.find((a) => a.k > 0) ?? R.arms[0];
    let thrK = 0, thrSwing = 0;
    if (this.thr >= 0) {
      this.thr += dt / 0.42;
      const p = this.thr;
      if (p < 0.3) { thrSwing = (p / 0.3) ** 2; thrK = 1; } else { thrSwing = 1; thrK = 1 - (p - 0.3) / 0.7; }
      if (this.thr >= 1) this.thr = -1;
    }
    for (const A of R.arms) {
      const k = A.k, pad = Math.sin(t * 1.3 + (k > 0 ? 0 : 2)), up = A === waver ? wv : 0, jg = jug * Math.sin(t * 7 + (k > 0 ? 0 : Math.PI));
      let rx = -c * 1.25 + pad * 0.07 - flex * 0.2 - jg * 0.4;
      let rz = k * (0.1 + c * 0.2 + up * 2.4 + flex * 1.5);
      let fx = -c * 0.5 - flex * 1.7 - jg * 0.6 + pad * 0.05;
      let gap = 1 + Math.sin(t * 2.3 + k) * 0.05 + c * 0.25 + sc * 0.6;
      let fwd = 0;
      // work
      if (wk > 0.01 && kind) {
        let wx = rx, wz = rz, wf = fx, wg2 = gap;
        if (kind === 'drill') { wx = -1.35 + Math.sin(t * 31 + k) * 0.035; wz = k * -0.14; wf = -0.12; wg2 = 1.3; A.spin += dt * 38; }
        else if (kind === 'dig') { const ph = t * 7.5 + (k > 0 ? Math.PI : 0); wx = -0.45 - 0.75 * Math.max(0, Math.sin(ph)); wz = k * 0.22; wf = -0.95 * Math.max(0, Math.cos(ph)); wg2 = 1.12; }
        else if (kind === 'graft' || kind === 'convert') { wx = -1.15 + Math.sin(t * 5 + k) * 0.08; wz = k * -0.22; wf = -0.45; wg2 = 1.22; }
        else { wx = -0.3; wz = k * 0.6; wf = -0.4; wg2 = 1.15; }
        rx = lerp(rx, wx, wk); rz = lerp(rz, wz, wk); fx = lerp(fx, wf, wk); gap = lerp(gap, wg2, wk);
      }
      // carrying overhead: one arm for a stone, both for a boulder
      const carry = (this.holdBig || A.id === 'armR' || R.arms.length === 1) ? this.holdK : 0;
      if (carry > 0.01) {
        rx = lerp(rx, -2.75, carry); rz = lerp(rz, k * (this.holdBig ? -0.42 : -0.16), carry); fx = lerp(fx, this.holdBig ? -0.55 : -0.85, carry); gap = lerp(gap, 0.95, carry);
      }
      // the throw: overhead, then hurled forward and down
      if (thrK > 0 && (this.holdBig || A.id === 'armR' || R.arms.length === 1)) {
        rx = lerp(rx, lerp(-2.8, -0.75, thrSwing), thrK); fx = lerp(fx, -0.1, thrK * thrSwing); gap = lerp(gap, 1 + thrSwing * 0.5, thrK);
      }
      // the punch: wind back, then the pistons fire the fist out along the arm
      if (A.punch >= 0) {
        A.punch += dt / 0.28;
        const p = A.punch;
        let ext = 0;
        if (p < 0.22) { const u = p / 0.22; fwd = 0.6 * u; ext = -0.35 * u; }
        else if (p < 0.4) { const u = (p - 0.22) / 0.18; fwd = 0.6 + 0.4 * u; ext = -0.35 + 1.35 * u; }
        else { const u = (p - 0.4) / 0.6, e = 1 - u * u * (3 - 2 * u); fwd = e; ext = e; }
        rx = lerp(rx, -1.58, fwd); rz = lerp(rz, k * -0.2, fwd); fx = lerp(fx, -0.04, fwd); gap = lerp(gap, 1 + ext * 1.0, fwd);
        if (A.punch >= 1) A.punch = -1;
      }
      A.root.position.set(k * (R.armX + sc * 0.16), 0.64 + Math.sin(t * 1.7 + k) * 0.015 + sc * 0.04, sc * 0.03 + fwd * 0.07);
      A.root.rotation.set(rx, 0, rz);
      A.upper.position.set(k * 0.03, -0.15 * gap, 0); A.fore.position.set(0, -0.17 * gap, 0.01); A.hand.position.set(0, -0.18 * gap, 0.02);
      A.fore.rotation.set(fx, 0, k * up * Math.sin(t * 9) * 0.35);
      A.hand.rotation.set(-c * 0.3, Math.sin(t * 0.7 + k) * 0.2 + flex * 0.4 + A.spin, 0);
      for (const p of A.pist) { const v = p.to.position, L = v.length(); p.g.position.set(0, 0, p.g.userData.z); p.g.quaternion.setFromUnitVectors(Y_UP, _b.copy(v).normalize()); p.g.scale.set(1, L, 1); }
    }
    // rubble rides the field under the lowest part; loose stones orbit; the dish sweeps; the antenna blinks
    for (const m of R.rubble) {
      const u = m.userData; u.a += dt * u.sp * (1 + c * 2 + wk * 2.5);
      const rr = torso ? u.r : u.r * 0.42, yy = torso ? u.y : this.headY - 0.19 + (u.y - 0.16) * 0.5;
      m.position.set(Math.cos(u.a) * rr, yy + Math.sin(t * 1.5 + u.a) * 0.02, Math.sin(u.a) * rr); m.rotation.x += dt * 0.7; m.rotation.y += dt * 0.5;
    }
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
    this.smokeT -= dt * (1 + c * 6 + this.damage * 4);
    if (this.smokeT <= 0 && h >= 1 && R.exhaust.length && this.root.visible) {
      this.smokeT = 0.5 + Math.random() * 1.2;
      const p = new THREE.Vector3(), tip = R.exhaust[Math.floor(Math.random() * R.exhaust.length)];
      tip.getWorldPosition(p);
      const sm = this.damage > 0.5;
      this.fx.burst(p.x, p.y, p.z, 1 + Math.round(c * 2) + (sm ? 2 : 0), sm ? 0x2a2624 : c > 0 ? 0x9a8a7a : 0x6a6660, { speed: 0.15, up: 0.5, size: 2, life: 1.1, grav: -0.4 });
    }
    // a damaged hull spits sparks
    this.sparkT -= dt * this.damage * 3;
    if (this.sparkT <= 0 && this.root.visible) {
      this.sparkT = 0.3 + Math.random() * 0.9;
      const p = (R.body ?? R.head).localToWorld(_a.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.3) * 0.2, (Math.random() - 0.5) * 0.3));
      this.fx.spray(p.x, p.y, p.z, Math.random() - 0.5, 0.6, Math.random() - 0.5, 4 + Math.round(this.damage * 6), 0xffc060, { glow: true, speed: 1.6, size: 1.6, life: 0.3, grav: 6 });
    }
    // eyes: dark until it wakes, then a slow shutter blink; a flash on events
    this.blinkT -= dt;
    let lid = 0;
    if (this.blinkT < 0.18) lid = Math.sin(clamp(this.blinkT / 0.18, 0, 1) * Math.PI);
    if (this.blinkT <= 0) this.blinkT = 3 + Math.random() * 4;
    if (h < 0.8) lid = 1 - clamp((h - 0.6) / 0.2, 0, 1);
    for (const e of R.eyes) e.scale.set(1, Math.max(0.08, 1 - lid), 1);
    this.flashK = Math.max(0, this.flashK - dt * 2.5);
    this.eyeMat.color.set(mixHex(this.look_.glow, 0xffffff, 0.55)).lerp(this.flashC, Math.min(1, this.flashK)).multiplyScalar(1.2 + c * 1.4 + this.flashK * 1.5);
    this.glowU.value = 0.7 + c * 2.0 + Math.max(0, Math.sin(t * 2.0)) * 0.3 + (Math.random() < 0.03 + this.damage * 0.08 ? 0.4 : 0) + (h > 0.7 && h < 1 ? (1 - h) * 6 : 0) + this.flashK * 0.8 + (mouthy ? wk * 0.8 : 0);
    if (c > 0.3 && Math.random() < dt * 30) {
      const p = R.arms.length ? R.arms[Math.random() < 0.5 ? 0 : R.arms.length - 1].hand.localToWorld(_a.set(0, -0.05, 0.05)) : this.headPos(_a);
      const g = new THREE.Color(this.look_.glow).multiplyScalar(2.2);
      this.fx.glow.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 0.6, 0.6, (Math.random() - 0.5) * 0.6, g, 1, 2.5, 0.6, -0.3, 1);
    }
    // parts flying in to be bolted on
    for (let i = this.asm.length - 1; i >= 0; i--) {
      const a = this.asm[i];
      a.t += dt;
      const u = clamp((a.t - a.delay) / a.dur, 0, 1);
      a.obj.visible = a.t >= a.delay;
      const e = 1 - (1 - u) ** 3, back = u < 1 ? Math.sin(u * Math.PI) * 0.12 * (1 - u) : 0;
      a.obj.position.copy(a.pos).addScaledVector(a.from, 1 - e - back);
      _qa.setFromEuler(_ea.set(a.spin.x * (1 - e), a.spin.y * (1 - e), a.spin.z * (1 - e)));
      a.obj.quaternion.copy(a.quat).multiply(_qa);
      a.obj.scale.copy(a.scale).multiplyScalar(0.55 + 0.45 * Math.min(1, u * 1.4));
      if (u >= 1) {
        a.obj.position.copy(a.pos); a.obj.quaternion.copy(a.quat); a.obj.scale.copy(a.scale);
        this.asm.splice(i, 1);
        // the click: a jolt, sparks at the joint
        a.obj.updateMatrixWorld(true);
        const at = a.obj.getWorldPosition(new THREE.Vector3());
        this.joltV.y += 0; this.joltV.x += (Math.random() - 0.5) * 2;
        this.fx.burst(at.x, at.y, at.z, 10, 0xffd080, { glow: true, speed: 1.6, up: 1.2, size: 1.8, life: 0.35, grav: 5 });
        if (!this.asm.some((o) => o.part === a.part)) this.onAssembled?.(a.part, at);
      }
    }
    void cam;
  }
}
const Y_UP = new THREE.Vector3(0, 1, 0);
