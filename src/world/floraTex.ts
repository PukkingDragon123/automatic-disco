// Hand-drawn pixel art for the 3D flora. Every leaf, petal, frond, grass blade, cap, cactus skin and seed pod is
// drawn per planet the way a pixel artist would: a hue-shifted ramp in clean bands (a lit half and a shaded half),
// a midrib and a few deliberate vein strokes, a highlight cluster placed by hand on the lit side near the tip, and
// a selective outline (darkest where the shape turns away from the light, softer on the lit edge). No noise mush:
// variety comes from shape, ramp and a few chosen marks. The drawings are cut out by alpha and shown with nearest
// magnification, so up close every texel reads as a pixel on the 3D structure. Bark and stems live in a second,
// vertically tiling texture drawn in neutral tones and tinted per limb.
// Painting is lazy and cached: the mesher asks for a look (shape + ramp + options) and gets an atlas rect.
import * as THREE from 'three';
import { Rand } from '../core/rand';
import { PROF, type Shape } from './plantStyle';
import { RAMPS } from '../art/palette';
import { fillPoly } from './pixelKit';
const M = (k: keyof typeof RAMPS) => [...RAMPS[k]] as number[];

export interface Rect { u0: number; v0: number; du: number; dv: number }
/** atlas size (texels) */
export const FLORA_ATLAS = 1024;

const keyOf = (ramp: number[]) => ramp.join('.');
const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/**
 * A pixel drawing: each texel holds a ramp index (-1 empty) and which ramp it uses. sel() outlines it, ink() writes
 * the colours. Light comes from the upper left of the drawing (texture x- and y-: toward the leaf base).
 */
class Px {
  readonly a: Int8Array; readonly r: Uint8Array;
  constructor(readonly w: number, readonly h: number, readonly ramps: number[][]) { this.a = new Int8Array(w * h).fill(-1); this.r = new Uint8Array(w * h); }
  set(x: number, y: number, i: number, ramp = 0) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const R = this.ramps[ramp]; this.a[y * this.w + x] = Math.max(0, Math.min(R.length - 1, Math.round(i))); this.r[y * this.w + x] = ramp;
  }
  get(x: number, y: number) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : this.a[y * this.w + x]; }
  /** shift a texel by d ramp steps (keeps its ramp) */
  nudge(x: number, y: number, d: number) { const i = this.get(x, y); if (i >= 0) this.a[y * this.w + x] = Math.max(0, Math.min(this.ramps[this.r[y * this.w + x]].length - 1, i + d)); }
  /** selective outline: edge texels facing away from the light go to the ramp's darkest steps, lit edges stay soft */
  sel(dark = 0, lit = 2) {
    const { w, h, a } = this, src = a.slice();
    const e = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || src[y * w + x] < 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (src[i] < 0) continue;
      const L = e(x - 1, y), Rt = e(x + 1, y), U = e(x, y - 1), D = e(x, y + 1);
      if (!(L || Rt || U || D)) continue;
      if (Rt || D) a[i] = Math.min(src[i], dark + (Rt && D ? 0 : 1));
      else a[i] = Math.min(src[i], Math.max(lit, src[i] - 1));
    }
  }
  /** write into the atlas; empty texels take the outline colour (clean mip fringes) */
  ink(put: (x: number, y: number, r: number, g: number, b: number, al: number) => void) {
    const { w, h, a } = this, f = rgb(this.ramps[0][1] ?? this.ramps[0][0]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (a[i] < 0) { put(x, y, f[0], f[1], f[2], 0); continue; }
      const c = rgb(this.ramps[this.r[i]][a[i]]); put(x, y, c[0], c[1], c[2], 255);
    }
  }
}

export class FloraTex {
  readonly S = FLORA_ATLAS;
  readonly data: Uint8Array;
  readonly tex: THREE.DataTexture;
  /** bark and stems: 8 neutral slots of 32 x 64, tiling vertically */
  readonly bark: THREE.DataTexture;
  private sx = 1; private sy = 1; private rowH = 0;
  private cache = new Map<string, Rect>();
  private fallback: Rect | null = null;
  used = 0;
  /** painted area by kind (profiling) */
  readonly painted: Record<string, [number, number, number]> = {};

  constructor(readonly seed: number) {
    this.data = new Uint8Array(this.S * this.S * 4);
    const t = (this.tex = new THREE.DataTexture(this.data, this.S, this.S, THREE.RGBAFormat, THREE.UnsignedByteType));
    t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
    // crisp texels up close, stable mips far away
    t.generateMipmaps = true; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter;
    this.bark = paintBark(seed);
  }
  /** upload once everything is painted */
  finish() { this.tex.needsUpdate = true; }

  private get(key: string, w: number, h: number, paint: (P: (ramps: number[][]) => Px) => Px): Rect {
    const hit = this.cache.get(key); if (hit) return hit;
    const S = this.S;
    if (this.sx + w + 2 > S) { this.sx = 1; this.sy += this.rowH + 2; this.rowH = 0; }
    if (this.sy + h + 1 > S) return this.fallback ?? { u0: 0, v0: 0, du: 1 / S, dv: 1 / S };
    const x0 = this.sx, y0 = this.sy;
    this.sx += w + 2; this.rowH = Math.max(this.rowH, h); this.used += w * h;
    const t0 = performance.now();
    const px = paint((ramps) => new Px(w, h, ramps));
    const d = this.data;
    px.ink((x, y, r, g, b, al) => { const i = ((y0 + y) * S + x0 + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = al; });
    const kk = key.slice(0, key.indexOf('|') < 0 ? key.length : key.indexOf('|')), e = (this.painted[kk] ??= [0, 0, 0]); e[0]++; e[1] += w * h; e[2] += performance.now() - t0;
    // the rect spans whole texels (nearest sampling lands on texel centres)
    const rc = { u0: x0 / S, v0: y0 / S, du: w / S, dv: h / S };
    this.cache.set(key, rc);
    if (!this.fallback) this.fallback = rc;
    return rc;
  }

  // -------------------------------------------------------------------------------------------- leaves
  /**
   * A leaf (or petal / floret) along +v, base at v0, its blade filling the rect's width at the widest point: a lit
   * left half and a shaded right half, a midrib, paired lateral veins, a hand-placed shine, selective outline.
   */
  leaf(shape: Shape, ramp: number[], o: { vein?: number; lat?: boolean; teeth?: boolean; petal?: boolean; var?: number } = {}): Rect {
    const key = `leaf|${shape}|${keyOf(ramp)}|${o.vein ?? 0}|${o.lat ? 1 : 0}|${o.teeth ? 1 : 0}|${o.petal ? 1 : 0}|${o.var ?? 0}`;
    const long = shape === 'strap' || shape === 'lance' || shape === 'needle';
    const W = o.petal ? 14 : long ? 12 : 16, H = o.petal ? 18 : long ? 36 : 30;
    return this.get(key, W, H, (mk) => {
      const P = mk([ramp]), n = ramp.length - 1, prof = PROF[shape], v = o.var ?? 0, r = new Rand(this.seed ^ (key.length * 7919) ^ (v * 131));
      let pmax = 0.01; for (let t = 0; t <= 1; t += 0.02) pmax = Math.max(pmax, prof(t));
      // each variant its own leaf: the midrib bends, the halves differ, one has a bite, one a curled tip
      const half = W / 2 - 0.5, bend = (v === 1 ? 1 : v === 2 ? -0.7 : 0.4) * r.range(0.6, 1.2), asym = (v === 2 ? -1 : 1) * r.range(0.1, 0.24);
      const biteT = !o.petal && v === 2 ? r.range(0.4, 0.62) : -1, curl = !o.petal && v === 1;
      const mid = (t: number) => W / 2 + bend * t * t * W * 0.22;
      const hw: number[] = [];
      for (let y = 0; y < H; y++) {
        const t = (y + 0.5) / H, cm = mid(t);
        let w = (prof(Math.min(0.995, t)) / pmax) * half;
        if (o.teeth && y % 3 === 1) w -= 1;
        hw.push(w);
        for (let x = 0; x < W; x++) {
          const sx = x + 0.5 - cm, side = sx < 0 ? -1 : 1;
          let ws = w * (1 + asym * side);
          if (biteT > 0 && side > 0 && Math.abs(t - biteT) < 0.09) ws -= Math.max(0, 2.4 - Math.abs(t - biteT) * 30);
          if (Math.abs(sx) > ws || t > 0.985) continue;
          // two clean bands: lit left, shaded right; the base a step darker, the tip a step lighter
          let i = sx < 0 ? n - 1 : n - 2;
          if (t < 0.18) i--;
          if (t > 0.72 && sx < 0) i = n;
          if (curl && t > 0.84) i = sx < 0 ? n - 2 : n - 3;
          if (o.petal) i = Math.min(n, (t < 0.3 ? 2 : t < 0.65 ? 3 : 4) + (sx < 0 ? 1 : 0));
          P.set(x, y, i);
        }
      }
      if (o.petal) {
        // petals: two fine veins from the heart, a pale lip
        for (let y = 2; y < H * 0.7; y++) { P.nudge(Math.floor(mid(y / H) - 2 - y * 0.08), y, -1); P.nudge(Math.floor(mid(y / H) + 1 + y * 0.08), y, -1); }
        for (let y = Math.floor(H * 0.72); y < H; y++) for (let x = 0; x < W; x++) if (P.get(x, y) >= 0 && P.get(x, y + 1) < 0 && x < mid(y / H)) P.set(x, y, n);
      } else {
        // the midrib follows the bend (pale on most leaves, a groove on some); lateral veins paired off it
        const rib = (o.vein ?? 0) < 0 ? -1 : 1;
        for (let y = 1; y < H - 2; y++) { const x = Math.floor(mid((y + 0.5) / H)); if (P.get(x, y) >= 0) P.nudge(x, y, rib); }
        if (o.lat || shape === 'ovate' || shape === 'heart' || shape === 'lobed' || shape === 'round') {
          for (let y0 = 4 + (v & 1); y0 < H - 5; y0 += 4 + (y0 > H * 0.6 ? 1 : 0)) for (let k = 1; k < hw[y0] - 1; k++) {
            const y = y0 + Math.floor(k * 0.8), m = Math.floor(mid((y + 0.5) / H));
            P.nudge(m - k, y, 1); P.nudge(m + 1 + k, y, -1);
          }
        }
        // the shine: a short streak on the lit half, a pixel inside the edge, two thirds of the way up
        const sy = Math.floor(H * r.range(0.52, 0.66));
        for (let k = 0; k < 3; k++) { const y = sy + k, x = Math.floor(mid((y + 0.5) / H) - Math.max(1, hw[Math.min(H - 1, y)] * (1 - asym) - 1.6)); if (P.get(x, y) >= 0) P.set(x, y, n); }
        if (v === 0 && r.chance(0.5)) { const y = Math.floor(H * r.range(0.3, 0.6)), x = Math.floor(mid(y / H) + r.range(1, Math.max(1.2, hw[y] - 1.5))); P.nudge(x, y, -2); P.nudge(x + 1, y, -1); }
      }
      P.sel(0, 2);
      return P;
    });
  }

  /** a needle spray (a conifer twig tip): needles fanning from a short twig, paler at their tips */
  needles(ramp: number[], var_ = 0): Rect {
    return this.get(`needles|${keyOf(ramp)}|${var_}`, 16, 22, (mk) => {
      const P = mk([ramp]), n = ramp.length - 1, r = new Rand(this.seed ^ 0x4ee ^ var_), W = 16, H = 22;
      for (let y = 0; y < 8; y++) P.set(W / 2 - 0.5, y, 1);
      const m = r.int(7, 9);
      for (let k = 0; k < m; k++) {
        const a = (k / (m - 1) - 0.5) * 2.0, by = 1 + k * 0.8, L = r.range(10, 14);
        for (let u = 0; u <= L; u++) P.set(W / 2 - 0.5 + Math.sin(a) * u * 0.62, by + Math.cos(a) * u * 0.9, u > L * 0.7 ? n - 1 : a < 0 ? n - 2 : n - 3);
      }
      P.sel(0, 2);
      return P;
    });
  }

  /**
   * A frond strip: the rachis down the middle, leaflets (pinnae) on both sides angled toward the tip, their length
   * following the frond's profile. hw: half width (m), len: frond length (m), lmax: longest pinna (m).
   */
  frond(ramps: number[][], rach: number[], o: { len: number; hw: number; lmax: number; fwd: number; wr: number; start: number; shape: Shape; lobes?: boolean; dead?: boolean; var?: number }): Rect {
    const key = `frond|${ramps.map(keyOf).join('/')}|${keyOf(rach)}|${Math.round(o.fwd * 4)}|${o.shape}|${o.lobes ? 1 : 0}|${o.dead ? 1 : 0}|${o.var ?? 0}`;
    const W = 34, H = 112;
    return this.get(key, W, H, (mk) => {
      const P = mk([...ramps, rach]), RI = ramps.length, r = new Rand(this.seed ^ (key.length * 31337) ^ ((o.var ?? 0) * 977));
      const cx = W / 2, pxX = (2 * o.hw) / W, pxY = o.len / H, slope = o.fwd * (pxX / pxY);
      const reach = W / 2 - 1.5, spacing = Math.max(2.6, Math.min(5, (o.lmax * 0.34) / pxY));
      const prof = PROF[o.shape];
      // pinnae, back to front so nearer ones overlap cleanly
      for (let y0 = o.start * H; y0 < H - 2; y0 += spacing) {
        const t = y0 / H, k = (t - o.start) / (1 - o.start), ll = Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + k * 0.92)), 0.7);
        if (ll < 0.1) continue;
        for (const side of [-1, 1]) {
          if (o.dead && r.chance(0.2)) continue;
          const L = reach * ll * (o.dead ? r.range(0.5, 1) : r.range(0.88, 1)), R = r.int(0, RI - 1), n = P.ramps[R].length - 1;
          const ww = Math.max(1, L * o.wr * 0.55);
          for (let u = 0; u <= L; u += 0.5) {
            const f = u / L, x = cx + side * u, y = y0 + u * slope;
            let w = prof(Math.min(0.99, f)) * ww;
            if (o.lobes && Math.floor(u) % 3 === 2) w *= 0.5;
            for (let d = -Math.ceil(w); d <= Math.ceil(w); d++) {
              if (Math.abs(d) > w + 0.25) continue;
              // the upper face of each leaflet is lit, the lower in shade, the tip catches the light
              let i = d < 0 ? n - 2 : n - 3;
              if (f > 0.75 && d <= 0) i = n - 1;
              if (d === 0 && ww >= 1.5 && f < 0.8) i = n - 4;
              P.set(x, y + d, Math.max(1, i), R);
            }
          }
        }
      }
      const rn = rach.length - 1;
      for (let y = 0; y < H - 1; y++) { const t = y / H; P.set(cx - 1, y, rn - 2, RI); if (t < 0.55) P.set(cx, y, rn - 3, RI); }
      P.sel(0, 2);
      return P;
    });
  }

  /** grass and strap blades: n columns, each a blade tapering to a point; a lit edge, a shaded edge, cured tips */
  blades(ramps: number[][], dry: number[] | null, n: number, o: { dryP?: number; wide?: boolean; var?: number; pairs?: boolean } = {}): Rect {
    const key = `blades|${ramps.map(keyOf).join('/')}|${dry ? keyOf(dry) : ''}|${n}|${o.dryP ?? 0}|${o.wide ? 1 : 0}|${o.var ?? 0}|${o.pairs ? 1 : 0}`;
    const cw = o.wide ? 8 : 5, H = o.wide ? 44 : 36;
    return this.get(key, cw * n, H, (mk) => {
      const all = dry ? [...ramps, dry] : ramps, P = mk(all), D = dry ? ramps.length : -1, r = new Rand(this.seed ^ (key.length * 4099) ^ ((o.var ?? 0) * 7));
      for (let b = 0; b < n; b++) {
        const R = (o.pairs ? b >> 1 : b) % ramps.length, nr = ramps[R].length - 1;
        const dryFrom = D >= 0 && (o.pairs ? b & 1 : r.chance(o.dryP ?? 0.3)) ? r.range(0.55, 0.8) : 2;
        for (let y = 0; y < H; y++) {
          const t = (y + 0.5) / H, hw = Math.min(1, t * 7 + 0.55) * Math.pow(1 - t, 0.6) * (cw / 2 - 0.3);
          for (let x = 0; x < cw; x++) {
            const s = x + 0.5 - cw / 2;
            if (Math.abs(s) > hw + 0.15 || t > 0.985) continue;
            let i = s < -0.5 ? nr - 1 : s < 0.5 ? nr - 2 : nr - 3;
            if (t < 0.2) i -= 1; else if (t > 0.6 && s < 0) i = nr;
            if (t > dryFrom) { const nd = all[D].length - 1; P.set(b * cw + x, y, s < 0 ? nd - 1 : nd - 2, D); }
            else P.set(b * cw + x, y, Math.max(1, i), R);
          }
        }
      }
      P.sel(0, 2);
      return P;
    });
  }

  /** a seed panicle (nodding grass head): seeds in pairs down a fine stalk */
  panicle(ramp: number[]): Rect {
    return this.get(`panicle|${keyOf(ramp)}`, 10, 20, (mk) => {
      const P = mk([ramp]), n = ramp.length - 1;
      for (let y = 0; y < 19; y++) P.set(5, y, 2);
      for (let y = 2; y < 19; y += 2) { const w = Math.max(1, Math.round((1 - y / 20) * 3.5)); for (let k = 1; k <= w; k++) { P.set(5 - k, y + k * 0.5, k === w ? n : n - 1); P.set(5 + k, y + k * 0.5, n - 2); } }
      P.sel(0, 2);
      return P;
    });
  }

  /** a clover leaf: three heart leaflets around a centre, each with a pale chevron */
  trefoil(ramp: number[], var_ = 0): Rect {
    return this.get(`trefoil|${keyOf(ramp)}|${var_}`, 16, 16, (mk) => {
      const P = mk([ramp]), n = ramp.length - 1, c = 8;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const dx = x + 0.5 - c, dy = y + 0.5 - c;
        for (let l = 0; l < 3; l++) {
          const a = (l * Math.PI * 2) / 3 + var_ * 0.4, ax = Math.cos(a), ay = Math.sin(a);
          const u = (dx * ax + dy * ay) / 7.2, s = (-dx * ay + dy * ax) / 7.2;
          if (u < 0 || u > 1 || Math.abs(s) > Math.sin(Math.PI * Math.pow(u, 0.7)) * 0.55 * (u > 0.85 && Math.abs(s) < 0.12 ? 0 : 1)) continue;
          let i = dx + dy < 0 ? n - 1 : n - 2;
          if (Math.abs(u - 0.5 - Math.abs(s) * 0.6) < 0.08) i = n;
          P.set(x, y, i);
        }
      }
      P.sel(0, 2);
      return P;
    });
  }

  // -------------------------------------------------------------------------------------------- solids
  /** a mushroom cap seen from above (planar mapped): an eight-faceted dome, each facet one ramp step by how it faces
   *  the light, a dark rim, flecks as small clusters, one shine */
  cap(ramp: number[], spots: number, spotCol: number, var_ = 0): Rect {
    return this.get(`cap|${keyOf(ramp)}|${spots}|${spotCol}|${var_}`, 24, 24, (mk) => {
      const sr = [spotCol, spotCol, spotCol, spotCol];
      const P = mk([ramp, sr]), n = ramp.length - 1, c = 12, r = new Rand(this.seed ^ (spotCol & 0xffff) ^ var_);
      const off = r.range(-1, 1), fac = 8;
      for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
        const dx = x + 0.5 - c - off, dy = y + 0.5 - c, a = Math.atan2(dy, dx), f = Math.floor(((a + Math.PI) / (Math.PI * 2)) * fac + 0.5) % fac;
        const fa = (f / fac) * Math.PI * 2 - Math.PI, face = -(Math.cos(fa) * 0.7 + Math.sin(fa) * 0.7);
        const ring = Math.max(Math.abs(dx), Math.abs(dy)) * 0.6 + (Math.abs(dx) + Math.abs(dy)) * 0.4;
        const crown = ring < 4.5;
        P.set(x, y, ring > 10.6 ? 1 : crown ? (dx + dy < 0 ? n - 1 : n - 2) : face > 0.3 ? n - 2 : face > -0.3 ? n - 3 : n - 4);
      }
      for (let k = 0; k < spots; k++) {
        const x = Math.floor(r.range(4, 19)), y = Math.floor(r.range(4, 19));
        P.set(x, y, 2, 1); P.set(x + 1, y, 3, 1); P.set(x, y + 1, 1, 1); if (r.chance(0.5)) P.set(x + 1, y + 1, 2, 1);
      }
      P.set(c - 4, c - 4, n); P.set(c - 3, c - 4, n);
      return P;
    });
  }
  /** the underside: radial gills converging on the stem */
  gills(ramp: number[]): Rect {
    return this.get(`gills|${keyOf(ramp)}`, 16, 16, (mk) => {
      const P = mk([ramp]), n = ramp.length - 1;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const dx = x + 0.5 - 8, dy = y + 0.5 - 8, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
        P.set(x, y, Math.max(Math.abs(dx), Math.abs(dy)) < 2.2 ? 1 : Math.abs(Math.sin(a * 10)) < 0.35 ? 1 : Math.min(n, 3));
        void d;
      }
      return P;
    });
  }
  /** a barrel cactus skin wrapped round its body: lit rib crests, dark furrows, areoles with pale spine stars */
  cactus(ramp: number[], ribs: number, flower: number): Rect {
    const W = ribs * 4;
    return this.get(`cactus|${keyOf(ramp)}|${ribs}|${flower}`, W, 48, (mk) => {
      const spine = M('bone').slice(1, 5);
      const P = mk([ramp, spine]), n = ramp.length - 1;
      for (let y = 0; y < 48; y++) for (let x = 0; x < W; x++) {
        const f = x % 4;
        P.set(x, y, f === 0 ? 1 : f === 1 ? n - 3 : f === 2 ? n - 1 : n - 2);
      }
      for (let k = 0; k < ribs; k++) for (let y = 3 + (k & 1) * 3; y < 48; y += 6) {
        const x = k * 4 + 2; P.set(x, y, 3, 1); P.set(x - 1, y - 1, 2, 1); P.set(x + 1, y - 1, 2, 1); P.set(x, y + 1, 1, 1);
      }
      return P;
    });
  }
  /** a ribbed seed pod / lantern bladder */
  pod(ramp: number[], ribs: number, glow: boolean): Rect {
    return this.get(`pod|${keyOf(ramp)}|${ribs}|${glow ? 1 : 0}`, 16, 24, (mk) => {
      const P = mk([ramp]), n = ramp.length - 1, per = Math.max(2, Math.round(16 / ribs));
      for (let y = 0; y < 24; y++) for (let x = 0; x < 16; x++) {
        const t = y / 24, f = x % per;
        // a facet per rib: crease lines a step down, the facet body in one tone, a lit patch high on it
        let i = f === 0 ? n - 4 : n - 3 + (glow && t > 0.3 && t < 0.7 ? 1 : 0);
        if (f === 1 && t > 0.25 && t < 0.45) i = n - 2;
        P.set(x, y, Math.max(1, i));
      }
      return P;
    });
  }
  /** an eye: an almond of sclera, an eight-sided iris, a slit pupil and a wet highlight */
  eye(iris: number[]): Rect {
    return this.get(`eye|${keyOf(iris)}`, 16, 16, (mk) => {
      const P = mk([iris, M('bone'), M('ink')]), n = iris.length - 1;
      fillPoly([[1, 8], [4, 3.5], [12, 3.5], [15, 8], [12, 12.5], [4, 12.5]], (x, y) => P.set(x, y, x + y < 16 ? 4 : 2, 1));
      const oct: [number, number][] = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.39; oct.push([8 + Math.cos(a) * 4.2, 8 + Math.sin(a) * 4.2]); }
      fillPoly(oct, (x, y) => P.set(x, y, y < 8 ? n - 1 : n - 3));
      for (let y = 4; y < 12; y++) P.set(8, y, 0, 2);
      P.set(6, 5, n); P.set(5, 6, n);
      return P;
    });
  }
  /** a floating lily pad seen from above: an irregular many-sided pad, a notch to the centre, vein strokes, a rim */
  pad(ramp: number[], var_ = 0): Rect {
    return this.get(`pad|${keyOf(ramp)}|${var_}`, 24, 24, (mk) => {
      const P = mk([ramp]), n = ramp.length - 1, notch = 0.25 + var_ * 1.7, r = new Rand(this.seed ^ 0x9ad ^ var_);
      const pts: [number, number][] = [[12, 12]];
      for (let k = 0; k <= 10; k++) { const a = notch + 0.28 + (k / 10) * (Math.PI * 2 - 0.56); pts.push([12 + Math.cos(a) * 11.4 * r.range(0.9, 1.03), 12 + Math.sin(a) * 11.4 * r.range(0.9, 1.03)]); }
      fillPoly(pts, (x, y) => P.set(x, y, x + y < 24 ? n - 2 : n - 3));
      for (let k = 0; k < 6; k++) { const a = notch + 0.8 + k * 0.9; for (let t = 2; t < 10; t++) { const x = Math.floor(12 + Math.cos(a) * t), y = Math.floor(12 + Math.sin(a) * t); if (P.get(x, y) >= 0) P.nudge(x, y, 1); } }
      P.set(7, 6, n); P.set(8, 6, n);
      P.sel(0, 2);
      return P;
    });
  }
  /** neutral skin for berries, beads and fruit (tinted per vertex): a lit cap and a shine */
  speckle(): Rect {
    return this.get('speckle', 8, 8, (mk) => {
      const P = mk([M('paper')]);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) P.set(x, y, y < 3 ? 3 : y < 6 ? 2 : 1);
      P.set(2, 2, 4); P.set(3, 2, 4);
      return P;
    });
  }
  /** pale faceted streaks for crystal shards (tinted per vertex) */
  crystal(): Rect {
    return this.get('crystal', 8, 16, (mk) => {
      const P = mk([M('paper').slice(2)]);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) P.set(x, y, x === 2 || (x === 3 && y > 9) ? 3 : x < 4 ? 2 : 1);
      return P;
    });
  }
  /** a small flower head seen from above, built of overlapping drawn petals round a faceted eye (light, tinted per
   *  instance by its bloom colour) */
  floret(form: number): Rect {
    return this.get(`floret|${form}`, 16, 16, (mk) => {
      const P = mk([M('paper'), M('ochre')]), np = [7, 5, 5, 11][form % 4], r = new Rand(this.seed ^ (form * 77));
      for (let p = 0; p < np; p++) {
        const a = (p / np) * Math.PI * 2 + r.range(-0.15, 0.15), L = form === 3 ? 4.5 : r.range(5.6, 7.2), w = form === 3 ? 1.1 : r.range(1.6, 2.3);
        const ca = Math.cos(a), sa = Math.sin(a), lit = ca + sa < 0;
        fillPoly([[8 + ca * 1.2 - sa * w * 0.4, 8 + sa * 1.2 + ca * w * 0.4], [8 + ca * L * 0.55 - sa * w, 8 + sa * L * 0.55 + ca * w], [8 + ca * L, 8 + sa * L], [8 + ca * L * 0.55 + sa * w, 8 + sa * L * 0.55 - ca * w], [8 + ca * 1.2 + sa * w * 0.4, 8 + sa * 1.2 - ca * w * 0.4]],
          (x, y) => P.set(x, y, lit ? 4 : (p & 1) ? 2 : 3));
      }
      if (form !== 3) { P.set(7, 7, 3, 1); P.set(8, 7, 2, 1); P.set(7, 8, 2, 1); P.set(8, 8, 1, 1); if (form !== 1) { P.set(6, 8, 2, 1); P.set(8, 6, 3, 1); } }
      P.sel(0, 1);
      return P;
    });
  }
}

// ------------------------------------------------------------------------------------------------ bark
/** bark slots (32 px each, tiling vertically, neutral grey: tinted per limb) */
export const BARK = { FURROW: 0, PLATE: 1, RING: 2, STEM: 3, FIBRE: 4, FLESH: 5 } as const;
export const BARK_SLOTS = 8;
const SW = 32, BH = 64;

/** pixel-art bark: plates and fissures drawn as deliberate marks, light from the left of each slot */
function paintBark(seed: number): THREE.DataTexture {
  const W = SW * BARK_SLOTS, d = new Uint8Array(W * BH * 4), r = new Rand(seed ^ 0xba4c);
  const T = [92, 128, 164, 196, 222];
  const put = (s: number, x: number, y: number, v: number, cr = 0, cg = 0, cb = 0) => {
    x = ((x % SW) + SW) % SW; y = ((y % BH) + BH) % BH;
    const i = (y * W + s * SW + x) * 4; d[i] = v + cr; d[i + 1] = v + cg; d[i + 2] = v + cb; d[i + 3] = 255;
  };
  for (let s = 0; s < BARK_SLOTS; s++) for (let y = 0; y < BH; y++) for (let x = 0; x < SW; x++) {
    // a round limb: lit on the left third, shaded on the right
    const band = x < 10 ? 3 : x < 22 ? 2 : 1;
    put(s, x, y, s === BARK.STEM || s === BARK.FLESH ? T[band + 1] - 10 : s === BARK.FIBRE ? T[Math.min(4, band + 2)] : T[band]);
  }
  // furrowed bark: long corky ridges split by dark fissures that wander and fork
  for (let k = 0; k < 7; k++) {
    let x = k * 4.6 + r.range(0, 2);
    for (let y = 0; y < BH; y++) {
      x += r.chance(0.25) ? r.sign() : 0;
      put(BARK.FURROW, Math.floor(x), y, T[0] - 14, 10, 0, -8);
      if (r.chance(0.15)) put(BARK.FURROW, Math.floor(x) + 1, y, T[0], 6);
    }
  }
  for (let k = 0; k < 10; k++) { const x = r.int(0, SW - 1), y = r.int(0, BH - 1); put(BARK.FURROW, x, y, T[3] + 12); put(BARK.FURROW, x + 1, y, T[2] + 10); }
  // plated bark: offset rows of plates, each outlined below and to the right
  for (let y = 0; y < BH; y++) for (let x = 0; x < SW; x++) {
    const row = Math.floor(y / 8), px = (x + (row & 1) * 4) % 8;
    if (y % 8 === 7 || px === 7) put(BARK.PLATE, x, y, T[0] - 10, 8, 0, -6);
    else if (y % 8 === 0 || px === 0) put(BARK.PLATE, x, y, (x < 16 ? T[3] : T[2]) + 6);
  }
  // a palm trunk: leaf-scar rings with a diamond weave between them
  for (let y = 0; y < BH; y++) for (let x = 0; x < SW; x++) {
    const ry = y % 16;
    if (ry === 0) put(BARK.RING, x, y, T[0] - 12, 10, 2, -8);
    else if (ry === 1) put(BARK.RING, x, y, T[3]);
    else if ((x + ry) % 8 === 0 || (x - ry + 64) % 8 === 0) put(BARK.RING, x, y, T[1]);
  }
  // stems: a fine lengthwise line or two; fibres: pale streaks; flesh: pores
  for (let y = 0; y < BH; y++) { put(BARK.STEM, 6, y, T[4]); put(BARK.STEM, 20, y, T[2] - 6); }
  for (let k = 0; k < 6; k++) { const x = r.int(0, SW - 1); for (let y = 0; y < BH; y++) if ((y + k * 7) % 11 < 7) put(BARK.FIBRE, x, y, T[2]); }
  for (let k = 0; k < 24; k++) put(BARK.FLESH, r.int(0, SW - 1), r.int(0, BH - 1), T[1]);
  const t = new THREE.DataTexture(d, W, BH, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.NearestMipmapLinearFilter; t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
/** bark u range for a slot (kept off the slot edges so filtering never reaches the neighbour) */
export const barkU = (slot: number, u: number) => (slot * SW + 0.5 + u * (SW - 1)) / (SW * BARK_SLOTS);
