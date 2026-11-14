// Hi-res painted textures for the 3D flora: every leaf, petal, frond, grass blade, mushroom cap, cactus skin and
// seed pod is painted per planet at roughly 300-500 texels per metre (the sprites are 32), with veins, midribs,
// pale edge highlights, mottling, insect bites and sun-cured tips, then packed into one atlas. Bark and stems live
// in a second, vertically tiling texture painted in neutral tones and tinted per limb by vertex colour.
// Painting is lazy and cached: the mesher asks for a texture by its look (shape + ramp + options) and gets a rect.
import * as THREE from 'three';
import { Rand } from '../core/rand';
import { PROF, type Shape } from './plantStyle';

export interface Rect { u0: number; v0: number; du: number; dv: number }

// ------------------------------------------------------------------------------------------------ noise
const NT = 256;
const NOISE = (() => { const r = new Rand(0x7a11), a = new Float32Array(NT * NT); for (let i = 0; i < a.length; i++) a[i] = r.next(); return a; })();
/** smooth value noise (tiles every 256) */
function vn(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const x0 = ix & 255, y0 = iy & 255, x1 = (x0 + 1) & 255, y1 = (y0 + 1) & 255;
  const a = NOISE[y0 * NT + x0], b = NOISE[y0 * NT + x1], c = NOISE[y1 * NT + x0], d = NOISE[y1 * NT + x1];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
/** value noise with integer periods px, py (tileable textures) */
function pn(x: number, y: number, px: number, py: number) {
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % px) + px) % px, y0 = ((iy % py) + py) % py, x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
  const a = NOISE[(y0 & 255) * NT + (x0 & 255)], b = NOISE[(y0 & 255) * NT + (x1 & 255)], c = NOISE[(y1 & 255) * NT + (x0 & 255)], d = NOISE[(y1 & 255) * NT + (x1 & 255)];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
const hh = (x: number, y: number, s = 0) => NOISE[((y * 31 + s * 17) & 255) * NT + ((x * 7 + s) & 255)];

// ------------------------------------------------------------------------------------------------ colour
/** a ramp sampled continuously (dark .. light); writes the colour into C */
const C = new Float32Array(3);
class RampF {
  readonly r: Float32Array; readonly g: Float32Array; readonly b: Float32Array; readonly n: number;
  constructor(ramp: number[]) {
    this.n = ramp.length; this.r = new Float32Array(this.n); this.g = new Float32Array(this.n); this.b = new Float32Array(this.n);
    ramp.forEach((c, i) => { this.r[i] = (c >> 16) & 255; this.g[i] = (c >> 8) & 255; this.b[i] = c & 255; });
  }
  at(v: number) {
    const f = Math.max(0, Math.min(0.9999, v)) * (this.n - 1), i = Math.floor(f), t = f - i;
    C[0] = this.r[i] + (this.r[i + 1] - this.r[i]) * t; C[1] = this.g[i] + (this.g[i + 1] - this.g[i]) * t; C[2] = this.b[i] + (this.b[i + 1] - this.b[i]) * t;
  }
}
const rampCache = new WeakMap<number[], RampF>();
const RF = (ramp: number[]) => { let f = rampCache.get(ramp); if (!f) rampCache.set(ramp, (f = new RampF(ramp))); return f; };
/** mix C toward an rgb colour */
const tintC = (r: number, g: number, b: number, k: number) => { C[0] += (r - C[0]) * k; C[1] += (g - C[1]) * k; C[2] += (b - C[2]) * k; };
const keyOf = (ramp: number[]) => ramp.join('.');

// ------------------------------------------------------------------------------------------------ atlas
interface Target { x0: number; y0: number; w: number; h: number }

export class FloraTex {
  readonly S = 2048;
  readonly data: Uint8Array;
  private readonly dataC: Uint8ClampedArray;
  readonly tex: THREE.DataTexture;
  /** bark and stems: 8 neutral slots of 128 x 256, tiling vertically */
  readonly bark: THREE.DataTexture;
  private sx = 2; private sy = 2; private rowH = 0;
  private cache = new Map<string, Rect>();
  private fallback: Rect | null = null;
  used = 0;
  /** painted area by kind (profiling) */
  readonly painted: Record<string, [number, number, number]> = {};

  constructor(readonly seed: number) {
    this.data = new Uint8Array(this.S * this.S * 4);
    this.dataC = new Uint8ClampedArray(this.data.buffer);
    this.tex = new THREE.DataTexture(this.data, this.S, this.S, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.flipY = false;
    this.tex.generateMipmaps = true;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.anisotropy = 4;
    this.bark = paintBark(seed);
  }
  /** upload once everything is painted */
  finish() { this.tex.needsUpdate = true; }

  private alloc(w: number, h: number): Target | null {
    const S = this.S;
    if (this.sx + w + 3 > S) { this.sx = 2; this.sy += this.rowH + 4; this.rowH = 0; }
    if (this.sy + h + 2 > S) return null;
    const t = { x0: this.sx, y0: this.sy, w, h };
    this.sx += w + 4; this.rowH = Math.max(this.rowH, h); this.used += w * h;
    return t;
  }
  /** cached paint: the same look is painted once */
  private get(key: string, w: number, h: number, paint: (T: Target, put: Put) => void): Rect {
    const hit = this.cache.get(key); if (hit) return hit;
    const T = this.alloc(w, h);
    if (!T) return this.fallback ?? { u0: 0, v0: 0, du: 1 / this.S, dv: 1 / this.S };
    const d = this.dataC, S = this.S;
    const put: Put = (x, y, a) => {
      const i = ((T.y0 + y) * S + T.x0 + x) * 4;
      d[i] = C[0]; d[i + 1] = C[1]; d[i + 2] = C[2]; d[i + 3] = a;
    };
    const t0 = performance.now();
    paint(T, put);
    const kk = key.slice(0, key.indexOf('|') < 0 ? key.length : key.indexOf('|')), e = (this.painted[kk] ??= [0, 0, 0]); e[0]++; e[1] += w * h; e[2] += performance.now() - t0;
    const r = { u0: (T.x0 + 0.5) / S, v0: (T.y0 + 0.5) / S, du: (w - 1) / S, dv: (h - 1) / S };
    this.cache.set(key, r);
    if (!this.fallback) this.fallback = r;
    return r;
  }

  // -------------------------------------------------------------------------------------------- leaves
  /**
   * A leaf (or a petal / floret) along +v, base at v0, its blade filling the rect's width at the widest point.
   * Pale midrib, lateral veins running out to the margin, a thin bright edge, mottling, optional teeth and bites.
   */
  leaf(shape: Shape, ramp: number[], o: { vein?: number; lat?: boolean; teeth?: boolean; petal?: boolean; var?: number } = {}): Rect {
    const key = `leaf|${shape}|${keyOf(ramp)}|${o.vein ?? 0}|${o.lat ? 1 : 0}|${o.teeth ? 1 : 0}|${o.petal ? 1 : 0}|${o.var ?? 0}`;
    const big = shape === 'strap' || shape === 'lance' || o.petal;
    return this.get(key, big ? 40 : 48, big && !o.petal ? 112 : o.petal ? 64 : 96, (T, put) => {
      const R = RF(ramp), prof = PROF[shape], W = T.w, H = T.h, r = new Rand(this.seed ^ (key.length * 7919) ^ ((o.var ?? 0) * 131));
      let pmax = 0.01; for (let t = 0; t <= 1; t += 0.02) pmax = Math.max(pmax, prof(t));
      const sq = (v: number) => v * v;
      const half = W / 2 - 1.2, nz = r.range(0, 200);
      // insect bites along the margin, a few rust spots with yellow halos
      const bites: number[][] = [], spots: number[][] = [];
      if (!o.petal && r.chance(0.35)) for (let k = r.int(1, 2); k > 0; k--) bites.push([r.sign() * half * r.range(0.6, 1), H * r.range(0.25, 0.85), r.range(3, 7)]);
      if (!o.petal && r.chance(0.3)) for (let k = r.int(1, 3); k > 0; k--) spots.push([r.range(-0.5, 0.5) * half, H * r.range(0.2, 0.8), r.range(1.2, 2.6)]);
      const vein = o.vein ?? 0, lat = o.lat || shape === 'heart' || shape === 'ovate' || shape === 'lobed', period = r.range(7, 10);
      for (let y = 0; y < H; y++) {
        const t = (y + 0.5) / H, hw = (prof(Math.min(0.999, t)) / pmax) * half;
        const tooth = o.teeth ? Math.abs(((t * H) / 5) % 1 - 0.5) * 2.4 : 0;
        for (let x = 0; x < W; x++) {
          const sx = x + 0.5 - W / 2, a = Math.abs(sx);
          let edge = hw - a - tooth;
          let v = 0.5 + (t - 0.45) * 0.2 + (sx < 0 ? 0.05 : -0.04) + (vn(x * 0.13 + nz, y * 0.07) - 0.5) * 0.14;
          if (o.petal) {
            // florets and petals: saturated heart, pale tips, fine veins fanning from the base
            v = 0.34 + t * 0.5 + (sx < 0 ? 0.04 : -0.03) + (vn(x * 0.2 + nz, y * 0.1) - 0.5) * 0.08;
            const ang = Math.atan2(sx, (t + 0.08) * H * 0.6);
            if (Math.abs(Math.sin(ang * 9)) < 0.22 && t > 0.12) v -= 0.06;
          } else {
            if (a < 1.25 && t > 0.03 && t < 0.93) v += vein > 0 ? 0.15 : vein < 0 ? -0.1 : 0.08;
            else if (lat && t > 0.06 && edge > 2.2) {
              const q = t * H * 0.55 - a * 0.8, d = Math.abs((q / period) % 1 - 0.5) * period;
              if (d < 0.65) v += 0.07; else if (d < 1.4) v -= 0.025;
            }
            for (const s of spots) { const dd = sq(sx - s[0]) + sq(y - s[1]); if (dd < s[2] * s[2]) v -= 0.18; else if (dd < sq(s[2] + 1.6)) v += 0.08; }
          }
          for (const b of bites) if (sq(sx - b[0]) + sq(y - b[1]) < b[2] * b[2]) edge = -1;
          R.at(v);
          if (edge >= 0 && edge < 1.4) { C[0] += (232 - C[0]) * 0.22; C[1] += (236 - C[1]) * 0.22; C[2] += (190 - C[2]) * 0.16; }
          if (!o.petal && t > 0.82) tintC(C[0] * 1.06, C[1] * 1.08, C[2] * 0.85, (t - 0.82) * 1.2);
          put(x, y, edge >= 0 && t < 0.995 ? 255 : 0);
        }
      }
    });
  }

  /** a needle spray (a conifer twig tip): needles fanning from a short twig, paler at their tips */
  needles(ramp: number[], var_ = 0): Rect {
    return this.get(`needles|${keyOf(ramp)}|${var_}`, 48, 64, (T, put) => {
      const R = RF(ramp), W = T.w, H = T.h, r = new Rand(this.seed ^ 0x4ee ^ var_);
      const cov = new Float32Array(W * H).fill(-1);
      const n = r.int(9, 13);
      for (let k = 0; k < n; k++) {
        const t0 = r.range(0.05, 0.6), a = (k / (n - 1) - 0.5) * 1.9 + r.range(-0.12, 0.12), L = r.range(0.45, 0.75) * H;
        const bx = W / 2, by = t0 * H * 0.7, ex = bx + Math.sin(a) * L * 0.62, ey = by + Math.cos(a) * L;
        const steps = Math.ceil(L * 1.5);
        for (let i = 0; i <= steps; i++) {
          const u = i / steps, x = bx + (ex - bx) * u, y = by + (ey - by) * u, w = 1.3 * (1 - u * 0.75);
          for (let yy = Math.floor(y - w); yy <= y + w; yy++) for (let xx = Math.floor(x - w); xx <= x + w; xx++) {
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 > w * w) continue;
            cov[yy * W + xx] = Math.max(cov[yy * W + xx], 0.3 + u * 0.55 + (xx < x ? 0.06 : -0.04));
          }
        }
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, twig = Math.abs(x + 0.5 - W / 2) < 1.1 && y < H * 0.45;
        R.at(cov[i] >= 0 ? cov[i] : 0.35);
        if (twig && cov[i] < 0) { C[0] *= 0.6; C[1] *= 0.5; C[2] *= 0.45; }
        put(x, y, cov[i] >= 0 || twig ? 255 : 0);
      }
    });
  }

  /**
   * A frond strip: the rachis down the middle, leaflets (pinnae) on both sides angled toward the tip, their length
   * following the frond's profile. hw: half width (m), len: frond length (m), lmax: longest pinna (m).
   */
  frond(ramps: number[][], rach: number[], o: { len: number; hw: number; lmax: number; fwd: number; wr: number; start: number; shape: Shape; lobes?: boolean; dead?: boolean; var?: number }): Rect {
    const key = `frond|${ramps.map(keyOf).join('/')}|${keyOf(rach)}|${Math.round(o.fwd * 4)}|${o.shape}|${o.lobes ? 1 : 0}|${o.dead ? 1 : 0}|${o.var ?? 0}`;
    return this.get(key, 96, 256, (T, put) => {
      const W = T.w, H = T.h, r = new Rand(this.seed ^ (key.length * 31337) ^ ((o.var ?? 0) * 977));
      const RS = ramps.map(RF), RR = RF(rach), pf = PROF[o.shape], LUT = new Float32Array(65);
      for (let k = 0; k <= 64; k++) LUT[k] = pf(k / 64);
      const prof = (u: number) => LUT[(u * 64) | 0];
      const pxX = (2 * o.hw) / W, pxY = o.len / H;
      // world-space pinnae: base on the rachis, axis out and forward
      const n = Math.max(8, Math.round(o.len / Math.max(0.035, o.lmax * 0.24)));
      const pin: { by: number; ax: number; ay: number; L: number; w: number; R: RampF; side: number; rag: number }[] = [];
      for (let i = 0; i < n; i++) {
        const t = o.start + ((i + 0.5) / n) * (1 - o.start), k = (t - o.start) / (1 - o.start);
        const ll = o.lmax * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + k * 0.92)), 0.7);
        if (ll < o.lmax * 0.08) continue;
        for (const side of [-1, 1]) {
          if (o.dead && r.chance(0.18)) continue;
          const L = ll * r.range(0.86, 1.08) * (o.dead ? r.range(0.5, 1) : 1), ang = Math.atan(o.fwd) + r.range(-0.06, 0.06);
          pin.push({ by: t * o.len + r.range(-0.3, 0.3) * pxY * 3, ax: side * Math.cos(ang), ay: Math.sin(ang), L, w: Math.max(pxX * 1.5, L * o.wr), R: RS[r.int(0, RS.length - 1)], side, rag: o.dead ? r.range(0, 1) : 0 });
        }
      }
      const cover = new Float32Array(W * H).fill(-1), col = new Float32Array(W * H * 3);
      // background colour (fringe for filtering)
      const bg = RS[0]; bg.at(0.45);
      for (let i = 0; i < W * H; i++) { col[i * 3] = C[0]; col[i * 3 + 1] = C[1]; col[i * 3 + 2] = C[2]; }
      for (const p of pin) {
        const ex = p.ax * p.L, ey = p.ay * p.L + p.by, x0 = Math.floor(Math.min(0, ex) / pxX + W / 2) - 2, x1 = Math.ceil(Math.max(0, ex) / pxX + W / 2) + 2;
        const y0 = Math.floor(Math.min(p.by, ey) / pxY - p.w / pxY) - 1, y1 = Math.ceil(Math.max(p.by, ey) / pxY + p.w / pxY) + 1;
        for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
          const X = (x + 0.5 - W / 2) * pxX, Y = (y + 0.5) * pxY - p.by;
          const u = (X * p.ax + Y * p.ay) / p.L; if (u < 0 || u > 1) continue;
          const c = (-X * p.ay + Y * p.ax) * p.side;
          let wv = prof(u) * p.w * 0.5;
          if (o.lobes) wv *= 0.72 + 0.28 * Math.abs(Math.cos(u * Math.PI * 5));
          if (p.rag > 0.5 && u > 0.6 && hh(x, y, 3) < 0.4) continue;
          if (Math.abs(c) > wv) continue;
          const i = y * W + x;
          let v = 0.4 + u * 0.32 + (c > 0 ? 0.07 : -0.05) + (vn(x * 0.2, y * 0.2 + p.by * 40) - 0.5) * 0.1;
          if (Math.abs(c) < pxX * 0.7 && u < 0.9) v += 0.1;
          if (wv - Math.abs(c) < pxX * 0.9) v += 0.06;
          p.R.at(v);
          if (o.dead) tintC(150, 112, 70, 0.3 + p.rag * 0.3);
          col[i * 3] = C[0]; col[i * 3 + 1] = C[1]; col[i * 3 + 2] = C[2]; cover[i] = 1;
        }
      }
      for (let y = 0; y < H; y++) {
        const t = y / H, rw = (1.8 * (1 - t) + 0.9);
        for (let x = 0; x < W; x++) {
          const i = y * W + x, dx = x + 0.5 - W / 2;
          if (Math.abs(dx) < rw && t > 0.005 && t < 0.99) { RR.at(0.55 - dx * 0.12 / rw); if (o.dead) tintC(150, 112, 70, 0.4); put(x, y, 255); continue; }
          C[0] = col[i * 3]; C[1] = col[i * 3 + 1]; C[2] = col[i * 3 + 2];
          put(x, y, cover[i] > 0 ? 255 : 0);
        }
      }
    });
  }

  /** grass and strap blades: n columns, each a blade tapering to a point; dark base, light tip, parallel veins */
  blades(ramps: number[][], dry: number[] | null, n: number, o: { dryP?: number; wide?: boolean; var?: number; pairs?: boolean } = {}): Rect {
    const key = `blades|${ramps.map(keyOf).join('/')}|${dry ? keyOf(dry) : ''}|${n}|${o.dryP ?? 0}|${o.wide ? 1 : 0}|${o.var ?? 0}|${o.pairs ? 1 : 0}`;
    const cw = o.wide ? 24 : 16;
    return this.get(key, cw * n, 128, (T, put) => {
      const H = T.h, r = new Rand(this.seed ^ (key.length * 4099) ^ ((o.var ?? 0) * 7));
      const D = dry ? RF(dry) : null;
      for (let b = 0; b < n; b++) {
        const R = RF(ramps[(o.pairs ? b >> 1 : b) % ramps.length]), nz = r.range(0, 99), bend = r.range(-0.15, 0.15);
        const dryFrom = D && (o.pairs ? b & 1 : r.chance(o.dryP ?? 0.3)) ? r.range(0.55, 0.8) : 2;
        for (let y = 0; y < H; y++) {
          const t = (y + 0.5) / H, hw = (Math.min(1, t * 9 + 0.55) * Math.pow(1 - t, 0.62)) * (cw / 2 - 1.3);
          const cx = cw / 2 + bend * t * t * cw * 0.3;
          for (let x = 0; x < cw; x++) {
            const sx = x + 0.5 - cx, a = Math.abs(sx);
            let v = 0.22 + Math.pow(t, 0.8) * 0.6 + (sx < 0 ? 0.06 : -0.05) + (vn(x * 0.3 + nz, y * 0.05) - 0.5) * 0.1;
            if (a < 0.9) v -= 0.05;
            else if (Math.abs((a / 2.3) % 1 - 0.5) < 0.18) v += 0.03;
            if (hw - a < 1.2) v += 0.06;
            R.at(v);
            if (D && t > dryFrom) { const k = Math.min(1, (t - dryFrom) * 6); const c0 = C[0], c1 = C[1], c2 = C[2]; D.at(0.35 + t * 0.5); C[0] = c0 + (C[0] - c0) * k; C[1] = c1 + (C[1] - c1) * k; C[2] = c2 + (C[2] - c2) * k; }
            put(b * cw + x, y, a <= hw && t < 0.992 ? 255 : 0);
          }
        }
      }
    });
  }

  /** a seed panicle (nodding grass head) */
  panicle(ramp: number[]): Rect {
    return this.get(`panicle|${keyOf(ramp)}`, 32, 64, (T, put) => {
      const R = RF(ramp), r = new Rand(this.seed ^ 0x9a1);
      const cov = new Uint8Array(T.w * T.h), cv = new Float32Array(T.w * T.h);
      for (let k = 0; k < 40; k++) {
        const t = r.range(0.05, 1), x = T.w / 2 + r.range(-1, 1) * (1 - t) * T.w * 0.38, y = t * T.h, rr = r.range(1.2, 2.2);
        for (let yy = Math.floor(y - rr * 2); yy <= y + rr * 2; yy++) for (let xx = Math.floor(x - rr); xx <= x + rr; xx++) {
          if (xx < 0 || yy < 0 || xx >= T.w || yy >= T.h) continue;
          const d = ((xx - x) / rr) ** 2 + ((yy - y) / (rr * 2)) ** 2; if (d > 1) continue;
          cov[yy * T.w + xx] = 1; cv[yy * T.w + xx] = 0.7 - d * 0.3 - (xx - x) * 0.05;
        }
      }
      for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) {
        const i = y * T.w + x, stalk = Math.abs(x + 0.5 - T.w / 2) < 0.8;
        R.at(cov[i] ? cv[i] : 0.4);
        put(x, y, cov[i] || stalk ? 255 : 0);
      }
    });
  }

  /** a clover leaf: three heart leaflets around a centre, each with a pale chevron */
  trefoil(ramp: number[], var_ = 0): Rect {
    return this.get(`trefoil|${keyOf(ramp)}|${var_}`, 64, 64, (T, put) => {
      const R = RF(ramp), W = T.w, c = W / 2;
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - c, dy = y + 0.5 - c;
        let inside = false, v = 0.5;
        for (let l = 0; l < 3; l++) {
          const a = (l * Math.PI * 2) / 3 + var_ * 0.4, ax = Math.cos(a), ay = Math.sin(a);
          const u = (dx * ax + dy * ay) / (W * 0.46), s = (-dx * ay + dy * ax) / (W * 0.46);
          if (u < 0 || u > 1) continue;
          const wv = Math.sin(Math.PI * Math.pow(u, 0.7)) * 0.55 * (1 - 0.35 * Math.max(0, 1 - Math.abs(s) * 6) * Math.max(0, u - 0.8) * 5);
          if (Math.abs(s) > wv) continue;
          inside = true;
          v = 0.42 + u * 0.25 + (s > 0 ? 0.05 : -0.04);
          const chev = Math.abs(u - 0.45 - Math.abs(s) * 0.6);
          if (chev < 0.05 && u > 0.25) v += 0.16;
          if (Math.abs(s) < 0.03) v -= 0.06;
        }
        R.at(v + (vn(x * 0.2, y * 0.2) - 0.5) * 0.08);
        put(x, y, inside ? 255 : 0);
      }
    });
  }

  // -------------------------------------------------------------------------------------------- solids
  /** a mushroom cap seen from above (planar mapped): radial fibrils, a darker or paler centre, flecks, rim */
  cap(ramp: number[], spots: number, spotCol: number, var_ = 0): Rect {
    return this.get(`cap|${keyOf(ramp)}|${spots}|${spotCol}|${var_}`, 96, 96, (T, put) => {
      const R = RF(ramp), W = T.w, c = W / 2, r = new Rand(this.seed ^ (spotCol & 0xffff) ^ var_ * 31);
      const sp: number[][] = [];
      for (let k = 0; k < spots * 2; k++) { const a = r.range(0, Math.PI * 2), d = Math.sqrt(r.next()) * 0.85; sp.push([Math.cos(a) * d * c, Math.sin(a) * d * c, r.range(2, 6)]); }
      const sr = (spotCol >> 16) & 255, sg = (spotCol >> 8) & 255, sb = spotCol & 255, dark = r.chance(0.5);
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.sqrt(dx * dx + dy * dy) / c, a = Math.atan2(dy, dx);
        let v = 0.6 + (dark ? -0.22 : 0.12) * Math.max(0, 1 - d * 1.6) + (vn(a * 20, d * 6) - 0.5) * 0.16 + (vn(x * 0.1, y * 0.1) - 0.5) * 0.08;
        if (d > 0.9) v -= (d - 0.9) * 2.2;
        R.at(v);
        const wob = 0.8 + 0.4 * vn(x * 0.4, y * 0.4);
        for (const s of sp) { const ex = dx - s[0], ey = dy - s[1], e2 = ex * ex + ey * ey, rr = s[2] * wob; if (e2 > (rr + 1) * (rr + 1)) continue; const dd = Math.sqrt(e2) - rr; if (dd < 0) tintC(sr, sg, sb, 0.9); else tintC(sr, sg, sb, 0.4 * (1 - dd)); }
        put(x, y, 255);
      }
    });
  }
  /** the underside: radial gills converging on the stem */
  gills(ramp: number[]): Rect {
    return this.get(`gills|${keyOf(ramp)}`, 64, 64, (T, put) => {
      const R = RF(ramp), W = T.w, c = W / 2;
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.sqrt(dx * dx + dy * dy) / c, a = Math.atan2(dy, dx);
        const g = Math.abs(Math.sin(a * (d > 0.5 ? 44 : 22)));
        R.at(0.35 + g * 0.35 - Math.max(0, 0.25 - d) * 1.2 + d * 0.15);
        put(x, y, 255);
      }
    });
  }
  /** a barrel cactus skin wrapped round its body: waxy bloom, areoles of pale spines along every rib crest */
  cactus(ramp: number[], ribs: number, flower: number): Rect {
    return this.get(`cactus|${keyOf(ramp)}|${ribs}|${flower}`, 160, 192, (T, put) => {
      const R = RF(ramp), W = T.w, H = T.h;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W, ph = (u * ribs) % 1, crest = Math.abs(ph - 0.5) * 2; // 1 on the crest .. 0 in the furrow
        let v = 0.32 + crest * 0.32 + (pn(x * 0.06, y * 0.04, W * 0.06, H * 0.04) - 0.5) * 0.12 + (y / H) * 0.08;
        R.at(v);
        tintC(200, 214, 200, 0.08 * crest);
        // areoles every 14 px down each crest: a felted boss with spines radiating
        const cxp = (Math.floor(u * ribs) + 0.5) / ribs * W, ay = Math.round(y / 11) * 11 + ((Math.floor(u * ribs) & 1) * 5.5);
        const dx = x + 0.5 - cxp, dy = y + 0.5 - ay, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 2.2) { C[0] = 226; C[1] = 218; C[2] = 196; if (d > 1.4) tintC(150, 140, 120, 0.4); }
        else if (d < 7.5) {
          const a = Math.atan2(dy, dx), sp = Math.abs(Math.sin(a * 3.5));
          if (sp < 0.1 * (7.5 / d)) { C[0] = 236; C[1] = 222; C[2] = 176; tintC(196, 160, 100, d / 10); }
        }
        put(x, y, 255);
      }
    });
  }
  /** a ribbed seed pod / lantern bladder */
  pod(ramp: number[], ribs: number, glow: boolean): Rect {
    return this.get(`pod|${keyOf(ramp)}|${ribs}|${glow ? 1 : 0}`, 64, 128, (T, put) => {
      const R = RF(ramp), W = T.w, H = T.h;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W, t = (y + 0.5) / H, rib = Math.abs(((u * ribs) % 1) - 0.5) * 2;
        let v = 0.45 + Math.sin(t * Math.PI) * 0.25 - Math.pow(1 - rib, 6) * 0.25 + (vn(x * 0.2, y * 0.1) - 0.5) * 0.1;
        if (Math.abs(Math.sin((u * ribs * 2 + t * 3) * Math.PI)) < 0.06) v += 0.08;
        R.at(v);
        if (glow) tintC(255, 246, 214, Math.sin(t * Math.PI) * 0.35 * rib);
        put(x, y, 255);
      }
    });
  }
  /** an eye: veined sclera, a striated iris, a slit pupil and a wet highlight */
  eye(iris: number[]): Rect {
    return this.get(`eye|${keyOf(iris)}`, 64, 64, (T, put) => {
      const R = RF(iris), W = T.w, c = W / 2;
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.sqrt(dx * dx + dy * dy) / c, a = Math.atan2(dy, dx);
        if (d < 0.6) {
          R.at(0.85 - d * 0.6 + (vn(a * 14, d * 10) - 0.5) * 0.3 - (dy > 0 ? 0.08 : 0));
          if (Math.abs(dx) < 2.2 * (1 - Math.abs(dy) / (c * 0.62)) + 0.4 && Math.abs(dy) < c * 0.58) { C[0] = 12; C[1] = 10; C[2] = 12; }
          if (d > 0.55) tintC(30, 24, 20, 0.7);
        } else {
          C[0] = 232; C[1] = 226; C[2] = 210;
          tintC(140, 130, 120, Math.max(0, (dx + dy) / (c * 2)) * 0.6 + Math.max(0, d - 0.8) * 1.5);
          if (Math.abs(Math.sin(a * 7 + vn(x * 0.3, y * 0.3) * 3)) < 0.05 && d > 0.7) tintC(190, 70, 60, 0.5);
        }
        if ((dx + c * 0.24) ** 2 + (dy + c * 0.26) ** 2 < (c * 0.12) ** 2) { C[0] = 250; C[1] = 248; C[2] = 240; }
        put(x, y, 255);
      }
    });
  }
  /** a floating lily pad seen from above: notch to the centre, radial veins, a darker turned-up rim */
  pad(ramp: number[], var_ = 0): Rect {
    return this.get(`pad|${keyOf(ramp)}|${var_}`, 96, 96, (T, put) => {
      const R = RF(ramp), W = T.w, c = W / 2, notch = 0.25 + var_ * 1.7;
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.sqrt(dx * dx + dy * dy) / c, a = Math.atan2(dy, dx);
        const da = Math.abs(((a - notch + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        let v = 0.5 + (vn(x * 0.07, y * 0.07) - 0.5) * 0.18 - (dx + dy) / W * 0.12;
        if (Math.abs(Math.sin(a * 11)) < 0.05 && d > 0.08 && d < 0.92) v += 0.08;
        if (d > 0.9) v -= 0.18;
        R.at(v);
        put(x, y, d < 0.98 && !(da < 0.12 + 0.05 * (1 - d) && d > 0.03) ? 255 : 0);
      }
    });
  }
  /** neutral speckled skin for berries, beads and fruit (tinted per vertex) */
  speckle(): Rect {
    return this.get('speckle', 32, 32, (T, put) => {
      for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) {
        const v = 215 + (pn(x * 0.4, y * 0.4, 12.8, 12.8) - 0.5) * 50 - (hh(x, y, 9) > 0.93 ? 50 : 0);
        C[0] = v; C[1] = v; C[2] = v; put(x, y, 255);
      }
    });
  }
  /** pale faceted streaks for crystal shards (tinted per vertex) */
  crystal(): Rect {
    return this.get('crystal', 32, 64, (T, put) => {
      for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) {
        const v = 200 + (vn(x * 0.25, y * 0.04) - 0.5) * 90 + (Math.abs(((x + y * 0.3) / 9) % 1 - 0.5) < 0.05 ? 40 : 0);
        C[0] = v; C[1] = v; C[2] = Math.min(255, v + 12); put(x, y, 255);
      }
    });
  }
  /** a small round flower head seen from above: a ring of petals round a disc (neutral, tinted per instance) */
  floret(form: number): Rect {
    return this.get(`floret|${form}`, 64, 64, (T, put) => {
      const W = T.w, c = W / 2, np = [12, 6, 5, 22][form % 4];
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.sqrt(dx * dx + dy * dy) / c, a = Math.atan2(dy, dx);
        const petal = Math.pow(Math.abs(Math.cos((a * np) / 2)), form === 3 ? 0.3 : 1.4);
        const rim = form === 3 ? 0.95 : 0.62 + 0.36 * petal;
        let v = 200 + d * 50 - (1 - petal) * 30 + (vn(a * 8, d * 12) - 0.5) * 30;
        if (Math.abs(Math.sin(a * np * 3)) < 0.12 && d > 0.3) v -= 18;
        C[0] = v; C[1] = v; C[2] = v;
        const disc = form === 1 ? 0.18 : form === 3 ? 0 : 0.26;
        if (d < disc) { C[0] = 236; C[1] = 176; C[2] = 52; if (hh(x, y, 4) > 0.6) { C[0] = 180; C[1] = 110; C[2] = 30; } }
        put(x, y, d < rim ? 255 : 0);
      }
    });
  }
}
type Put = (x: number, y: number, a: number) => void;

// ------------------------------------------------------------------------------------------------ bark
/** bark slots (128 px each, tiling vertically, neutral grey: tinted per limb) */
export const BARK = { FURROW: 0, PLATE: 1, RING: 2, STEM: 3, FIBRE: 4, FLESH: 5 } as const;
export const BARK_SLOTS = 8;

function paintBark(seed: number): THREE.DataTexture {
  const SW = 128, W = SW * BARK_SLOTS, H = 128, d = new Uint8Array(W * H * 4);
  const r = new Rand(seed ^ 0xba4c);
  const o1 = r.range(0, 99), o2 = r.range(0, 99);
  for (let s = 0; s < BARK_SLOTS; s++) for (let y = 0; y < H; y++) for (let x = 0; x < SW; x++) {
    if (s > BARK.FLESH) { const i = (y * W + s * SW + x) * 4; d[i] = d[i + 1] = d[i + 2] = 200; d[i + 3] = 255; continue; }
    let v = 170, cr = 0, cg = 0, cb = 0;
    if (s === BARK.FURROW) {
      // deep vertical fissures between long corky ridges, lichen blotches
      const n = pn(x / 9 + o1, y / 16, SW / 9, H / 16) * 0.65 + pn(x / 4.5, y / 8, SW / 4.5, H / 8) * 0.35;
      const fis = Math.abs(n - 0.5);
      v = fis < 0.06 ? 70 + fis * 400 : 150 + (n - 0.5) * 120 + (pn(x / 2, y / 2.5, SW / 2, H / 2.5) - 0.5) * 40;
      if (fis < 0.06) { cr = 14; cg = -4; cb = -10; }
      const li = pn(x / 14 + o2, y / 14, SW / 14, H / 14);
      if (li > 0.68 && fis > 0.08) { v += 40; cg = 16; cr = 2; cb = -6; }
    } else if (s === BARK.PLATE) {
      // scaly plates: a cell pattern, edges darker, plates flaking
      const cx = x / 16, cy = y / 16, ix = Math.floor(cx + (Math.floor(cy) & 1) * 0.5), fy = cy - Math.floor(cy), fx = cx + (Math.floor(cy) & 1) * 0.5 - ix;
      const e = Math.min(fx, 1 - fx, fy * 1.4, (1 - fy) * 1.4);
      v = 120 + Math.min(1, e * 6) * 70 + (hh(ix & 7, Math.floor(cy) & 15, 5) - 0.5) * 40 + (pn(x / 3, y / 3, SW / 3, H / 3) - 0.5) * 30;
      if (e < 0.08) { cr = 10; cb = -8; }
    } else if (s === BARK.RING) {
      // a palm trunk: leaf-scar rings with a diamond weave between them
      const ring = (y % 16) / 16, dia = Math.abs(((x / 128) * 12 + ring * 2) % 1 - 0.5) + Math.abs(((x / 128) * 12 - ring * 2) % 1 - 0.5);
      v = 150 + (ring < 0.14 ? -70 + ring * 300 : 0) + (dia < 0.35 ? -18 : 8) + (pn(x / 3, y / 5, SW / 3, H / 5) - 0.5) * 36;
      if (ring < 0.14) { cr = 10; cg = 2; cb = -8; }
    } else if (s === BARK.STEM) {
      // green stalk: faint lengthwise striations and a soft sheen
      v = 196 + (Math.abs(((x / SW) * 14) % 1 - 0.5) < 0.08 ? -18 : 0) + (pn(x / 3, y / 16, SW / 3, H / 16) - 0.5) * 22;
    } else if (s === BARK.FIBRE) {
      // mushroom stem: pale fibres, a ragged ring
      v = 214 + (pn(x / 1.6, y / 16, SW / 1.6, H / 16) - 0.5) * 50;
    } else if (s === BARK.FLESH) {
      // fleshy coral stems: smooth with tiny pores
      v = 200 + (pn(x / 6, y / 6, SW / 6, H / 6) - 0.5) * 30 - (hh(x, y, 2) > 0.94 ? 40 : 0);
    } else v = 200;
    const i = (y * W + s * SW + x) * 4;
    d[i] = Math.max(0, Math.min(255, v + cr)); d[i + 1] = Math.max(0, Math.min(255, v + cg)); d[i + 2] = Math.max(0, Math.min(255, v + cb)); d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
/** bark u range for a slot (kept off the slot edges so filtering never reaches the neighbour) */
export const barkU = (slot: number, u: number) => (slot * 128 + 2 + u * 124) / (128 * BARK_SLOTS);
