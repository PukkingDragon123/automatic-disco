// Grown structures. Each is a cluster of textured boxes (array-texture bio materials, emissive pixels flagged in
// alpha) built procedurally, rising out of the moss while it grows, breathing and pulsing once alive.
import * as THREE from 'three';
import { PixelCanvas, makeRamp, mixHex } from '../limbo/gfx/pixel';
import { tileFbm, hashf } from '../limbo/core/rng';
import { Rand } from '../core/rand';
import { Noise } from '../core/noise';
import { gbuf, F_SEL, F_HOVER, F_ENEMY } from '../gfx/gbuf';
import { VEYR } from '../world/palette';
import type { Faction } from './species';

export type BKind = 'core' | 'spire' | 'tap' | 'brood' | 'vault' | 'maw' | 'thorn' | 'coil' | 'lure' | 'spore';
export interface BDef {
  kind: BKind; name: string; desc: string; key: string;
  bio: number; min: number; time: number; hp: number; radius: number; sight: number; supply: number; em: number;
  /** placement rule */
  onDeposit?: boolean;
}
export const BDEFS: Record<BKind, BDef> = {
  core: { kind: 'core', name: 'Veyr Core', key: '', desc: 'The heart that fell from the sky. Lose it and you are only rock.', bio: 0, min: 0, time: 1, hp: 2400, radius: 2.6, sight: 18, supply: 6, em: 1 },
  spire: { kind: 'spire', name: 'Nerve Spire', key: 'S', desc: 'Carries your field outward: moss can grow and buildings can root within its reach.', bio: 45, min: 0, time: 14, hp: 380, radius: 0.9, sight: 14, supply: 0, em: 1 },
  tap: { kind: 'tap', name: 'Root Tap', key: 'T', desc: 'Drives roots into a ferrite or crystal seam and pumps minerals up.', bio: 35, min: 0, time: 12, hp: 320, radius: 1.1, sight: 8, supply: 0, em: 1, onDeposit: true },
  brood: { kind: 'brood', name: 'Brood Womb', key: 'B', desc: 'Gestates your designs. Each womb also feeds six more of your creatures.', bio: 70, min: 15, time: 20, hp: 520, radius: 1.6, sight: 10, supply: 6, em: 1 },
  maw: { kind: 'maw', name: 'Digestion Maw', key: 'M', desc: 'A ring of teeth around a pit. Drags nearby corpses in and digests them twice as fast.', bio: 50, min: 10, time: 15, hp: 420, radius: 1.4, sight: 9, supply: 0, em: 1 },
  vault: { kind: 'vault', name: 'Gene Vault', key: 'V', desc: 'A helix of bone and light. Lets you absorb one more gene from every corpse, and bridges lineages.', bio: 90, min: 40, time: 26, hp: 460, radius: 1.2, sight: 9, supply: 0, em: 2 },
  thorn: { kind: 'thorn', name: 'Thorn Bulb', key: 'H', desc: 'Fires barbed spines at anything hostile that comes near.', bio: 45, min: 20, time: 14, hp: 360, radius: 0.9, sight: 11, supply: 0, em: 1 },
  coil: { kind: 'coil', name: 'Storm Coil', key: 'C', desc: 'Spends charge to throw lightning at intruders.', bio: 40, min: 45, time: 18, hp: 380, radius: 0.9, sight: 13, supply: 0, em: 2 },
  lure: { kind: 'lure', name: 'Lure Bloom', key: 'L', desc: 'A sweet-smelling giant flower. Grazers wander in to feed on it.', bio: 30, min: 0, time: 10, hp: 220, radius: 1.0, sight: 8, supply: 0, em: 1 },
  spore: { kind: 'spore', name: 'Spore Tower', key: 'P', desc: 'A towering sporangium. When the region is yours, it carries your seed to the next.', bio: 220, min: 140, time: 45, hp: 900, radius: 1.6, sight: 16, supply: 0, em: 4 },
};
export const BUILD_ORDER: BKind[] = ['spire', 'tap', 'brood', 'maw', 'thorn', 'lure', 'vault', 'coil', 'spore'];

// ------------------------------------------------------------------ bio texture layers
const BL = { flesh: 0, chitin: 1, bone: 2, membrane: 3, glow: 4, rock: 5, moss: 6, crystal: 7, petal: 8, tooth: 9 } as const;
type BLayer = keyof typeof BL;
const TS = 32;
let BIO: THREE.DataArrayTexture | null = null;
function bioTexture(): THREE.DataArrayTexture {
  if (BIO) return BIO;
  const n = Object.keys(BL).length, data = new Uint8Array(TS * TS * 4 * n);
  const ci = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : Math.round(v));
  const paint = (k: BLayer, fn: (pc: PixelCanvas, r: Rand) => void) => { const pc = new PixelCanvas(TS, TS); fn(pc, new Rand(BL[k] * 977 + 3)); data.set(pc.data, BL[k] * TS * TS * 4); };
  paint('flesh', (pc, r) => {
    const R = makeRamp(0x2e7a6a, 7, { spread: 0.6 });
    pc.each((x, y) => pc.set(x, y, R[ci(2 + tileFbm(x, y, TS, TS, 4, 3, 11) * 2.4 + (pc.clusterT(x, y) - 0.5), 1, 4)]));
    for (let i = 0; i < 5; i++) { let x = r.int(0, 31), y = r.int(0, 31); for (let k = 0; k < 14; k++) { pc.set(x, y, VEYR.vein, k % 4 === 0 ? 170 : 255); x += r.pick([-1, 0, 1]); y += r.pick([0, 1]); } }
    for (let i = 0; i < 8; i++) { const x = r.int(0, 31), y = r.int(0, 31); pc.set(x, y, R[6]); pc.set(x + 1, y, R[5]); }
  });
  paint('chitin', (pc, r) => {
    const R = makeRamp(0x1e3a40, 7, { spread: 0.6 });
    pc.each((x, y) => { const band = y % 8; pc.set(x, y, R[ci((band === 0 ? 0 : band === 1 ? 5 : 2.4) + tileFbm(x, y, TS, TS, 3, 2, 5) * 1.2, 0, 6)]); });
    for (let i = 0; i < 10; i++) pc.set(r.int(0, 31), r.int(0, 31), R[6]);
  });
  paint('bone', (pc, r) => {
    const R = makeRamp(0xd8d0b8, 6, { spread: 0.45 });
    pc.each((x, y) => pc.set(x, y, R[ci(2.6 + tileFbm(x, y, TS, TS, 4, 3, 21) * 1.8 + (pc.clusterT(x, y) - 0.5) * 0.8, 1, 5)]));
    for (let i = 0; i < 12; i++) pc.set(r.int(0, 31), r.int(0, 31), R[0]);
    for (let i = 0; i < 3; i++) { let x = r.int(0, 31), y = r.int(0, 31); for (let k = 0; k < 6; k++) { pc.set(x, y, R[1]); x += r.pick([-1, 1]); y++; } }
  });
  paint('membrane', (pc) => {
    const R = makeRamp(0x5ad8b0, 6, { spread: 0.5 });
    pc.each((x, y) => { const v = hashf(x >> 2, y >> 2, 7); const vein = (x + y * 2) % 13 === 0 || (x * 3 - y) % 17 === 0; pc.set(x, y, vein ? R[1] : R[ci(3 + v, 2, 5)], vein ? 255 : 210); });
  });
  paint('glow', (pc, r) => {
    const R = makeRamp(VEYR.core, 6, { spread: 0.5 });
    pc.fill(R[1]);
    for (let i = 0; i < 9; i++) { const x = r.int(2, 29), y = r.int(2, 29), rad = r.int(2, 4); for (let j = -rad; j <= rad; j++) for (let k = -rad; k <= rad; k++) if (j * j + k * k <= rad * rad) pc.set(x + k, y + j, R[ci(5 - Math.hypot(j + 1, k + 1) * 0.8, 2, 5)], 150); }
  });
  paint('rock', (pc, r) => {
    const R = makeRamp(0x3a3448, 7, { spread: 0.6 });
    const pts = Array.from({ length: 8 }, () => [r.range(0, 32), r.range(0, 32)]);
    pc.each((x, y) => {
      let d1 = 99, d2 = 99;
      for (const p of pts) { let dx = Math.abs(x - p[0]); dx = Math.min(dx, 32 - dx); let dy = Math.abs(y - p[1]); dy = Math.min(dy, 32 - dy); const d = Math.hypot(dx, dy); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
      const crack = d2 - d1 < 1.1;
      const deep = crack && hashf(x >> 2, y >> 2, 3) > 0.55;
      pc.set(x, y, crack ? (deep ? mixHex(VEYR.vein, 0x1a3a34, 0.35) : R[0]) : R[ci(2.5 + tileFbm(x, y, TS, TS, 4, 3, 41) * 2 - d1 * 0.05, 0, 5)], deep ? 200 : 255);
    });
  });
  paint('moss', (pc, r) => {
    const R = makeRamp(VEYR.moss, 7, { spread: 0.6 });
    pc.each((x, y) => pc.set(x, y, R[ci(2 + tileFbm(x, y, TS, TS, 4, 3, 77) * 2.5, 1, 5)]));
    for (let i = 0; i < 30; i++) { const x = r.int(0, 31), y = r.int(0, 31); pc.set(x, y, R[6]); pc.set(x + 1, y + 1, R[1]); }
  });
  paint('crystal', (pc) => {
    const R = makeRamp(VEYR.em, 7, { spread: 0.6 });
    pc.each((x, y) => { const f = ((x + y) % 16) / 16; pc.set(x, y, R[ci(2 + f * 4 + (x % 8 === 0 ? -2 : 0), 0, 6)], 170); });
  });
  paint('petal', (pc) => {
    const R = makeRamp(0xd85aa0, 7, { spread: 0.55 });
    pc.each((x, y) => pc.set(x, y, R[ci(2 + (y / 32) * 3.5 + (x % 6 === 0 ? -1 : 0) + tileFbm(x, y, TS, TS, 3, 2, 3) * 0.8, 0, 6)]));
  });
  paint('tooth', (pc) => {
    const R = makeRamp(0xece4cc, 6, { spread: 0.4 });
    pc.each((x, y) => pc.set(x, y, R[ci(4 - (y / 32) * 2.5 + (x % 8 < 2 ? -1 : 0), 0, 5)]));
  });
  const t = new THREE.DataArrayTexture(data, TS, TS, n);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
  BIO = t;
  return t;
}

// ------------------------------------------------------------------ model building
interface MBox { c: [number, number, number]; s: [number, number, number]; m: BLayer; rx?: number; ry?: number; rz?: number; part?: number }
class MB {
  boxes: MBox[] = [];
  box(c: [number, number, number], s: [number, number, number], m: BLayer, rot: { rx?: number; ry?: number; rz?: number } = {}, part = 0) { this.boxes.push({ c, s, m, ...rot, part }); }
  build(): THREE.BufferGeometry {
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], lay: number[] = [], prt: number[] = [], idx: number[] = [];
    const F: [number[], number[], number[]][] = [[[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]]];
    const e = new THREE.Euler(), q = new THREE.Quaternion(), v = new THREE.Vector3();
    for (const b of this.boxes) {
      e.set(b.rx ?? 0, b.ry ?? 0, b.rz ?? 0); q.setFromEuler(e);
      for (const [n, u, w] of F) {
        const hu = Math.abs(u[0]) * b.s[0] + Math.abs(u[1]) * b.s[1] + Math.abs(u[2]) * b.s[2];
        const hw = Math.abs(w[0]) * b.s[0] + Math.abs(w[1]) * b.s[1] + Math.abs(w[2]) * b.s[2];
        const hn = Math.abs(n[0]) * b.s[0] + Math.abs(n[1]) * b.s[1] + Math.abs(n[2]) * b.s[2];
        // rounded: the face grid is pushed onto a superellipsoid so structures look grown, not stacked
        const base = pos.length / 3, NS = 3, e = b.m === 'glow' || b.m === 'membrane' ? 2.4 : 3.2;
        const hs = [b.s[0] / 2, b.s[1] / 2, b.s[2] / 2];
        for (let j = 0; j <= NS; j++) for (let i = 0; i <= NS; i++) {
          const a = (i / NS) * 2 - 1, c = (j / NS) * 2 - 1;
          const qx = n[0] + u[0] * a + w[0] * c, qy = n[1] + u[1] * a + w[1] * c, qz = n[2] + u[2] * a + w[2] * c;
          const nr = Math.pow(Math.abs(qx) ** e + Math.abs(qy) ** e + Math.abs(qz) ** e, 1 / e);
          const px = qx / nr, py = qy / nr, pz = qz / nr;
          v.set(px * hs[0], py * hs[1], pz * hs[2]).applyQuaternion(q);
          pos.push(b.c[0] + v.x, b.c[1] + v.y, b.c[2] + v.z);
          v.set(Math.sign(px) * Math.abs(px) ** (e - 1) / hs[0], Math.sign(py) * Math.abs(py) ** (e - 1) / hs[1], Math.sign(pz) * Math.abs(pz) ** (e - 1) / hs[2]).applyQuaternion(q).normalize();
          nor.push(v.x, v.y, v.z);
          uv.push((a * 0.5 + 0.5) * hu, (c * 0.5 + 0.5) * hw);
          lay.push(BL[b.m]); prt.push(b.part ?? 0);
        }
        for (let j = 0; j < NS; j++) for (let i = 0; i < NS; i++) { const v0 = base + j * (NS + 1) + i; idx.push(v0, v0 + 1, v0 + NS + 2, v0, v0 + NS + 2, v0 + NS + 1); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aLayer', new THREE.Float32BufferAttribute(lay, 1));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(prt, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
}

function coreModel(mb: MB, r: Rand, part: 'shell' | 'cap' = 'shell') {
  // ring of shard crystals around the rock (the rock itself is built by asteroidGeometry)
  if (part === 'cap') return;
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + r.range(-0.2, 0.2); mb.box([Math.cos(a) * 2.9, 0.2, Math.sin(a) * 2.9], [0.24, r.range(0.5, 0.9), 0.24], 'crystal', { rz: Math.cos(a) * 0.5, rx: Math.sin(a) * 0.5 }, 2); }
  mb.box([0, 1.95, 0], [1.6, 0.16, 1.6], 'glow', {}, 1);
}
/** the asteroid: a lumpy faceted rock with glowing fissures; 'cap' is the sealed top that bursts at hatching */
export function asteroidGeometry(seed: number, part: 'shell' | 'cap'): THREE.BufferGeometry {
  const nz = new Noise(seed), base = new THREE.IcosahedronGeometry(2.5, 4).toNonIndexed();
  const P = base.attributes.position as THREE.BufferAttribute;
  const disp = (x: number, y: number, z: number) => { const l = Math.hypot(x, y, z) || 1; const nx = x / l, ny = y / l, nzz = z / l; const k = 1 + nz.fbm3(nx * 1.6, ny * 1.6, nzz * 1.6, 4) * 0.28 + Math.abs(nz.n3(nx * 4, ny * 4, nzz * 4)) * 0.06; return [nx * 2.5 * k * 1.05, ny * 2.5 * k * 0.86 + 1.2, nzz * 2.5 * k]; };
  const pos: number[] = [], uv: number[] = [], lay: number[] = [], prt: number[] = [];
  for (let t = 0; t < P.count; t += 3) {
    const tri = [0, 1, 2].map((k) => disp(P.getX(t + k), P.getY(t + k), P.getZ(t + k)));
    const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    const isCap = cy > 3.0;
    if ((part === 'cap') !== isCap) continue;
    const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cz = (tri[0][2] + tri[1][2] + tri[2][2]) / 3;
    const fis = Math.abs(nz.n3(cx * 0.55 + 7, cy * 0.55, cz * 0.55)) < 0.06;
    for (const v of tri) { pos.push(v[0], v[1], v[2]); uv.push(v[0] + v[2] * 0.7, v[1]); lay.push(fis ? BL.glow : BL.rock); prt.push(fis ? 1 : 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aLayer', new THREE.Float32BufferAttribute(lay, 1));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(prt, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
function merge(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  const bb = b.index ? b.toNonIndexed() : b, aa = a.index ? a.toNonIndexed() : a;
  for (const k of ['position', 'normal', 'uv', 'aLayer', 'aPart']) {
    const A = aa.attributes[k] as THREE.BufferAttribute, B = bb.attributes[k] as THREE.BufferAttribute;
    const arr = new Float32Array(A.array.length + B.array.length); arr.set(A.array as Float32Array); arr.set(B.array as Float32Array, A.array.length);
    out.setAttribute(k, new THREE.BufferAttribute(arr, A.itemSize));
  }
  out.computeBoundingSphere();
  return out;
}

function model(kind: BKind, seed: number): THREE.BufferGeometry {
  const mb = new MB(), r = new Rand(seed);
  switch (kind) {
    case 'core': coreModel(mb, r); return merge(asteroidGeometry(seed, 'shell'), mb.build());
    case 'spire': {
      for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; mb.box([Math.cos(a) * 0.55, 0.2, Math.sin(a) * 0.55], [0.22, 0.5, 0.7], 'flesh', { ry: -a, rz: 0.5 }); }
      let y = 0, w = 0.75;
      for (let i = 0; i < 7; i++) { const h = 0.55; mb.box([0, y + h / 2, 0], [w, h, w], i % 2 ? 'chitin' : 'bone', { ry: i * 0.3 }); y += h * 0.92; w *= 0.88; }
      mb.box([0, y + 0.3, 0], [0.55, 0.55, 0.55], 'glow', { ry: 0.78, rx: 0.6 }, 1);
      for (let i = 0; i < 3; i++) { const a = i * 2.1; mb.box([Math.cos(a) * 0.32, y - 0.2, Math.sin(a) * 0.32], [0.1, 0.8, 0.1], 'bone', { rz: Math.cos(a) * 0.7, rx: -Math.sin(a) * 0.7 }); }
      break;
    }
    case 'tap': {
      mb.box([0, 0.45, 0], [1.3, 0.9, 1.3], 'flesh', {}, 1);
      mb.box([0, 1.05, 0], [0.9, 0.5, 0.9], 'membrane', {}, 1);
      mb.box([0, 1.45, 0], [0.4, 0.35, 0.4], 'glow', { ry: 0.78 }, 2);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; mb.box([Math.cos(a) * 0.9, 0.15, Math.sin(a) * 0.9], [0.18, 0.3, 0.9], 'chitin', { ry: -a, rx: 0.4 }); }
      break;
    }
    case 'brood': {
      mb.box([0, 0.3, 0], [2.6, 0.6, 2.6], 'flesh');
      mb.box([0, 1.3, 0], [1.8, 1.7, 1.8], 'membrane', {}, 1);
      mb.box([0, 2.25, 0], [1.2, 0.5, 1.2], 'membrane', {}, 1);
      mb.box([0, 1.2, 0], [0.8, 0.8, 0.8], 'glow', { ry: 0.6, rx: 0.3 }, 2);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; mb.box([Math.cos(a) * 1.25, 1.4, Math.sin(a) * 1.25], [0.2, 2.4, 0.2], 'bone', { rz: Math.cos(a) * -0.35, rx: Math.sin(a) * 0.35 }); }
      break;
    }
    case 'vault': {
      mb.box([0, 0.2, 0], [1.6, 0.4, 1.6], 'bone');
      for (let i = 0; i < 14; i++) {
        const y = 0.4 + i * 0.28, a = i * 0.55;
        for (const s of [-1, 1]) mb.box([Math.cos(a) * 0.55 * s, y, Math.sin(a) * 0.55 * s], [0.34, 0.24, 0.34], i % 3 === 0 ? 'glow' : 'bone', { ry: a }, i % 3 === 0 ? 1 : 0);
        mb.box([0, y, 0], [1.1, 0.06, 0.12], 'crystal', { ry: a }, 2);
      }
      break;
    }
    case 'maw': {
      mb.box([0, 0.12, 0], [2.6, 0.24, 2.6], 'flesh');
      mb.box([0, 0.15, 0], [1.4, 0.26, 1.4], 'rock', {}, 0);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; mb.box([Math.cos(a) * 1.05, 0.55, Math.sin(a) * 1.05], [0.22, 0.85, 0.22], 'tooth', { rz: -Math.cos(a) * 0.45, rx: Math.sin(a) * 0.45 }, 1); }
      mb.box([0, 0.3, 0], [0.9, 0.06, 0.9], 'glow', {}, 2);
      break;
    }
    case 'thorn': {
      mb.box([0, 0.5, 0], [0.3, 1.0, 0.3], 'chitin');
      mb.box([0, 1.25, 0], [0.9, 0.8, 0.9], 'flesh', { ry: 0.4 }, 1);
      for (let i = 0; i < 10; i++) { const a = r.range(0, 6.28), e = r.range(-0.6, 0.9); mb.box([Math.cos(a) * 0.55, 1.25 + Math.sin(e) * 0.45, Math.sin(a) * 0.55], [0.1, 0.7, 0.1], 'bone', { rz: Math.cos(a) * 1.2, rx: -Math.sin(a) * 1.2 }, 1); }
      break;
    }
    case 'coil': {
      for (let i = 0; i < 8; i++) mb.box([0, 0.25 + i * 0.42, 0], [0.9 - i * 0.05, 0.16, 0.9 - i * 0.05], i % 2 ? 'bone' : 'chitin', { ry: i * 0.4 });
      mb.box([0, 1.7, 0], [0.22, 3.3, 0.22], 'chitin');
      mb.box([0, 3.65, 0], [0.5, 0.7, 0.5], 'crystal', { ry: 0.78, rx: 0.2 }, 1);
      break;
    }
    case 'lure': {
      mb.box([0, 0.4, 0], [0.22, 0.8, 0.22], 'flesh');
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; mb.box([Math.cos(a) * 0.65, 0.9, Math.sin(a) * 0.65], [0.55, 0.08, 1.1], 'petal', { ry: -a + Math.PI / 2, rx: 0.35 }, 1); }
      mb.box([0, 1.05, 0], [0.4, 0.4, 0.4], 'glow', { ry: 0.5 }, 2);
      break;
    }
    case 'spore': {
      mb.box([0, 0.35, 0], [2.4, 0.7, 2.4], 'flesh');
      let y = 0.7;
      for (let i = 0; i < 9; i++) { mb.box([0, y + 0.3, 0], [1.1 - i * 0.06, 0.6, 1.1 - i * 0.06], i % 2 ? 'bark' as any : 'chitin', { ry: i * 0.25 }); y += 0.55; }
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; mb.box([Math.cos(a) * 1.0, y - 0.6 + (i % 2) * 0.5, Math.sin(a) * 1.0], [0.7, 0.7, 0.7], 'membrane', { ry: a }, 1); }
      mb.box([0, y + 0.5, 0], [1.0, 1.0, 1.0], 'glow', { ry: 0.78, rx: 0.6 }, 2);
      break;
    }
  }
  for (const b of mb.boxes) if ((b.m as string) === 'bark') b.m = 'chitin';
  return mb.build();
}
const GEO = new Map<string, THREE.BufferGeometry>();
/** the asteroid's sealed top: it bursts when the Veyr hatches */
export function coreCapGeometry(x: number, z: number) { return asteroidGeometry(Math.floor(x * 131 + z * 7), 'cap'); }

// ------------------------------------------------------------------ runtime
let NEXT = 1;
export class Building {
  readonly id = NEXT++;
  hp: number; progress = 0; done = false;
  readonly mesh: THREE.Mesh;
  readonly U = { uGrow: { value: 0 }, uPulse: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) }, uTintK: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 }, uGlowMul: { value: 1 } };
  readonly flag = { value: 1 };
  selected = false; hovered = false;
  /** production queue (brood): species ids; timer */
  queue: number[] = []; qT = 0;
  rally: [number, number] | null = null;
  cool = 0;
  dead = false;
  /** root tap: deposit index */
  deposit = -1;
  visibleNow = true;
  constructor(readonly def: BDef, readonly faction: Faction, public x: number, public z: number, public y: number, tint?: number) {
    this.hp = def.hp * 0.15;
    const key = def.kind + (def.kind === 'core' ? ':' + Math.floor(x * 7 + z) : '');
    let g = GEO.get(key); if (!g) GEO.set(key, (g = model(def.kind, Math.floor(x * 131 + z * 7))));
    const m = new THREE.MeshLambertMaterial();
    const U = this.U;
    if (tint !== undefined) { U.uTint.value.set(tint); U.uTintK.value = 0.55; }
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, { uBio: { value: bioTexture() } });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aLayer; attribute float aPart; uniform float uGrow, uPulse, uTime; varying vec3 vUvl; varying float vPart;')
        .replace('#include <begin_vertex>', `vec3 transformed = position;
float g = clamp(uGrow, 0.0, 1.0);
float wob = sin(uTime * 2.0 + position.y * 3.0) * 0.04 * (1.0 - g) * g;
transformed.xz *= (0.35 + 0.65 * g) * (1.0 + wob + uPulse * 0.03 * step(0.5, aPart));
transformed.y *= g;
vUvl = vec3(uv, aLayer); vPart = aPart;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform highp sampler2DArray uBio; uniform vec3 uTint; uniform float uTintK, uFlash, uPulse, uTime, uGlowMul; varying vec3 vUvl; varying float vPart;')
        .replace('#include <map_fragment>', `vec4 bt = texture(uBio, vUvl, -0.35);
vec3 bc = mix(bt.rgb, bt.rgb * uTint * 1.4, uTintK);
diffuseColor.rgb *= bc;
float glowB = (1.0 - bt.a) * (1.1 + uPulse * 0.9 * step(0.5, vPart)) * uGlowMul;`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += bc * glowB + vec3(1.0, 0.4, 0.3) * uFlash;');
    };
    m.customProgramCacheKey = () => 'oddworld-building';
    gbuf(m, this.flag);
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.y = def.kind === 'core' ? 0 : ((x * 13 + z * 7) % 6) * 0.5;
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.userData.building = this;
  }
  get maxHp() { return this.def.hp; }
  sync(dt: number, t: number) {
    const U = this.U;
    U.uGrow.value += ((this.done ? 1 : this.progress) - U.uGrow.value) * Math.min(1, dt * 6);
    U.uTime.value = t;
    U.uPulse.value = 0.5 + 0.5 * Math.sin(t * (this.def.kind === 'core' ? 1.3 : 2.1) + this.id);
    U.uFlash.value = Math.max(0, U.uFlash.value - dt * 3);
    this.flag.value = 1 + (this.selected ? F_SEL : 0) + (this.hovered ? (this.faction === 'veyr' ? F_HOVER : F_ENEMY) : 0);
    this.mesh.visible = this.visibleNow;
  }
  dispose() { this.mesh.removeFromParent(); (this.mesh.material as THREE.Material).dispose(); }
}
void mixHex;
