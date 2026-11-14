// Hand-drawn pixel art for the 3D flora, at twice the old texel density. Every leaf, petal, frond, grass blade, cap,
// cactus skin and seed pod is drawn per planet the way a pixel artist would: master-palette ramps in clean planes
// (shadow, base, a lit plane, a bright highlight edge), a midrib and deliberate vein strokes, secondary marks (edge
// wear, nicks, browned tips, insect holes), a 1 px dark coloured outline round every silhouette (the darkest step of
// the shape's own ramp), and on wet or glossy surfaces a tiny specular glint from the palette's lightest steps. No
// noise mush: variety comes from shape, ramp and a few chosen marks. The drawings are cut out by alpha and shown with
// nearest magnification, so up close every texel reads as a pixel on the 3D structure. Bark and stems live in a
// second, vertically tiling texture drawn in neutral tones and tinted per limb.
// Painting is lazy and cached: the mesher asks for a look (shape + ramp + options) and gets an atlas rect.
import * as THREE from 'three';
import { Rand } from '../core/rand';
import { PROF, type Shape } from './plantStyle';
import { RAMPS } from '../art/palette';
import { fillPoly } from './pixelKit';
const M = (k: keyof typeof RAMPS) => [...RAMPS[k]] as number[];

export interface Rect { u0: number; v0: number; du: number; dv: number }
/** atlas size (texels): 1024 wide, twice as tall */
export const FLORA_ATLAS = 1024;
export const FLORA_ATLAS_H = 2048;

const keyOf = (ramp: number[]) => ramp.join('.');
const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
/** the glint ramp: specular sparkle on wet leaves, glossy caps, crystals and beads */
const GLINT = M('snow');
/** atlas shelf heights */
const SHELF = [16, 24, 36, 48, 64, 80, 96, 128, 160, 224, 256];

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
  get(x: number, y: number) { x = Math.floor(x); y = Math.floor(y); return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : this.a[y * this.w + x]; }
  /** shift a texel by d ramp steps (keeps its ramp) */
  nudge(x: number, y: number, d: number) { x = Math.floor(x); y = Math.floor(y); const i = this.get(x, y); if (i >= 0) this.a[y * this.w + x] = Math.max(0, Math.min(this.ramps[this.r[y * this.w + x]].length - 1, i + d)); }
  /** clear a texel (holes, nicks) */
  cut(x: number, y: number) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.a[y * this.w + x] = -1; }
  /** a specular glint: a 2 px streak and a pixel below-left, from the glint ramp (index gi) */
  glint(x: number, y: number, gi: number, big = false) {
    const g = this.ramps.length - 1;
    if (this.get(x, y) < 0) return;
    this.set(x, y, 5, gi < 0 ? g : gi); this.set(x + 1, y, 4, gi < 0 ? g : gi); if (big) { this.set(x, y + 1, 4, gi < 0 ? g : gi); }
    if (this.get(x - 1, y + 2) >= 0) this.set(x - 1, y + 2, 3, gi < 0 ? g : gi);
  }
  /** the dark coloured outline: every edge texel takes its ramp's darkest steps, darkest away from the light */
  sel(dark = 0, lit = 1) {
    const { w, h, a } = this, src = a.slice();
    const e = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || src[y * w + x] < 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (src[i] < 0) continue;
      const L = e(x - 1, y), Rt = e(x + 1, y), U = e(x, y - 1), D = e(x, y + 1);
      if (!(L || Rt || U || D)) continue;
      if (this.r[i] === this.ramps.length - 1 && this.ramps.length > 1 && this.ramps[this.r[i]] === GLINT) this.r[i] = 0;
      if (Rt || D) a[i] = dark; else a[i] = Math.min(src[i], lit);
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
  readonly S = FLORA_ATLAS; readonly SH = FLORA_ATLAS_H;
  readonly data: Uint8Array;
  readonly tex: THREE.DataTexture;
  /** bark and stems: 8 neutral slots of 64 x 128, tiling vertically */
  readonly bark: THREE.DataTexture;
  private shelves = new Map<number, { x: number; y: number }>(); private top = 1;
  private cache = new Map<string, Rect>();
  private fallback: Rect | null = null;
  used = 0;
  /** painted area by kind (profiling) */
  readonly painted: Record<string, [number, number, number]> = {};

  constructor(readonly seed: number) {
    this.data = new Uint8Array(this.S * this.SH * 4);
    const t = (this.tex = new THREE.DataTexture(this.data, this.S, this.SH, THREE.RGBAFormat, THREE.UnsignedByteType));
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
    // shelves by height class, so tall fronds and small leaves never share (and waste) a row
    const bh = SHELF.find((b) => h <= b) ?? h;
    let sh = this.shelves.get(bh);
    if (!sh || sh.x + w + 2 > S) {
      if (this.top + bh + 1 > this.SH) return this.fallback ?? { u0: 0, v0: 0, du: 1 / S, dv: 1 / this.SH };
      sh = { x: 1, y: this.top }; this.top += bh + 2; this.shelves.set(bh, sh);
    }
    const x0 = sh.x, y0 = sh.y;
    sh.x += w + 2; this.used += w * h;
    const t0 = performance.now();
    const px = paint((ramps) => new Px(w, h, ramps));
    const d = this.data;
    px.ink((x, y, r, g, b, al) => { const i = ((y0 + y) * S + x0 + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = al; });
    const kk = key.slice(0, key.indexOf('|') < 0 ? key.length : key.indexOf('|')), e = (this.painted[kk] ??= [0, 0, 0]); e[0]++; e[1] += w * h; e[2] += performance.now() - t0;
    // the rect spans whole texels (nearest sampling lands on texel centres)
    const rc = { u0: x0 / S, v0: y0 / this.SH, du: w / S, dv: h / this.SH };
    this.cache.set(key, rc);
    if (!this.fallback) this.fallback = rc;
    return rc;
  }

  // -------------------------------------------------------------------------------------------- leaves
  /**
   * A leaf (or petal) along +v, base at v0, its blade filling the rect's width at the widest point: a lit left half
   * and a shaded right half, a bright highlight edge along the lit margin, a midrib with a groove shadow beside it,
   * paired lateral veins, a hand-placed shine with a wet glint, wear by variant (nicks, a browned tip, a bite, a
   * hole), a dark coloured outline.
   */
  leaf(shape: Shape, ramp: number[], o: { vein?: number; lat?: boolean; teeth?: boolean; petal?: boolean; var?: number } = {}): Rect {
    const key = `leaf|${shape}|${keyOf(ramp)}|${o.vein ?? 0}|${o.lat ? 1 : 0}|${o.teeth ? 1 : 0}|${o.petal ? 1 : 0}|${o.var ?? 0}`;
    const long = shape === 'strap' || shape === 'lance' || shape === 'needle';
    const W = o.petal ? 28 : long ? 24 : 32, H = o.petal ? 36 : long ? 72 : 60;
    return this.get(key, W, H, (mk) => {
      const brown = M('ochre'), P = mk([ramp, brown, GLINT]), n = ramp.length - 1, prof = PROF[shape], v = o.var ?? 0, r = new Rand(this.seed ^ (key.length * 7919) ^ (v * 131));
      let pmax = 0.01; for (let t = 0; t <= 1; t += 0.02) pmax = Math.max(pmax, prof(t));
      // each variant its own leaf: the midrib bends, the halves differ, one has a bite and a hole, one a browned tip
      const half = W / 2 - 1, bend = (v === 1 ? 1 : v === 2 ? -0.7 : 0.4) * r.range(0.6, 1.2), asym = (v === 2 ? -1 : 1) * r.range(0.1, 0.24);
      const biteT = !o.petal && v === 2 ? r.range(0.4, 0.62) : -1, curl = !o.petal && v === 1;
      const mid = (t: number) => W / 2 + bend * t * t * W * 0.22;
      const hw: number[] = [], ws: number[][] = [];
      for (let y = 0; y < H; y++) {
        const t = (y + 0.5) / H, cm = mid(t);
        let w = (prof(Math.min(0.995, t)) / pmax) * half;
        if (o.teeth) w -= ((y % 6) / 6) * 2;
        hw.push(w); ws.push([w * (1 - asym), w * (1 + asym)]);
        for (let x = 0; x < W; x++) {
          const sx = x + 0.5 - cm, side = sx < 0 ? -1 : 1;
          let wsd = w * (1 + asym * side);
          if (biteT > 0 && side > 0 && Math.abs(t - biteT) < 0.09) wsd -= Math.max(0, 4.8 - Math.abs(t - biteT) * 60);
          if (Math.abs(sx) > wsd || t > 0.985) continue;
          // planes: lit left, shaded right; the base a step darker, the tip a step lighter; the lit margin bright
          let i = sx < 0 ? n - 1 : n - 2;
          if (t < 0.18) i--;
          if (t > 0.72 && sx < 0) i = n;
          if (sx < 0 && -sx > wsd - 2 && t > 0.22 && t < 0.86) i = n;
          if (curl && t > 0.84) i = sx < 0 ? n - 2 : n - 3;
          if (o.petal) { i = Math.min(n, (t < 0.15 ? 1 : t < 0.3 ? 2 : t < 0.65 ? 3 : 4) + (sx < 0 ? 1 : 0)); if (sx < 0 && -sx > wsd - 2 && t > 0.3) i = n; }
          P.set(x, y, i);
        }
      }
      if (o.petal) {
        // petals: fine veins fanning from the heart, a pale lip, a crease down the middle in shade
        for (let y = 3; y < H * 0.72; y++) { const m = mid(y / H); P.nudge(m - 4 - y * 0.1, y, -1); P.nudge(m + 2 + y * 0.1, y, -1); if (y % 2 === 0) P.nudge(m, y, -1); }
        for (let y = Math.floor(H * 0.74); y < H; y++) for (let x = 0; x < W; x++) if (P.get(x, y) >= 0 && P.get(x, y + 2) < 0 && x < mid(y / H)) P.set(x, y, n);
      } else {
        // the midrib follows the bend: two texels wide at the base, a groove shadow on its shaded side
        const rib = (o.vein ?? 0) < 0 ? -1 : 1;
        for (let y = 1; y < H - 3; y++) {
          const x = Math.floor(mid((y + 0.5) / H)), t = y / H;
          if (P.get(x, y) >= 0) P.nudge(x, y, rib);
          if (t < 0.4 && P.get(x - 1, y) >= 0) P.nudge(x - 1, y, rib);
          if (P.get(x + 1, y) >= 0) P.nudge(x + 1, y, -1);
        }
        if (o.lat || shape === 'ovate' || shape === 'heart' || shape === 'lobed' || shape === 'round' || shape === 'lance') {
          // paired lateral veins sweeping toward the tip, lit above on the lit half, shadowed on the shaded half
          for (let y0 = 8 + (v & 1) * 2; y0 < H - 10; y0 += 8 + (y0 > H * 0.6 ? 2 : 0)) for (let k = 2; k < hw[y0] - 2; k++) {
            const y = y0 + Math.floor(k * 0.8), m = Math.floor(mid((y + 0.5) / H));
            P.nudge(m - k, y, 1); P.nudge(m + 1 + k, y, -1); if (k % 3 === 0) { P.nudge(m - k, y + 1, -1); }
          }
        }
        // the shine: a short streak inside the lit margin two thirds of the way up, and a wet glint at its top
        const sy = Math.floor(H * r.range(0.5, 0.62));
        let gx = -1, gy = -1;
        for (let k = 0; k < 6; k++) { const y = sy + k, x = Math.floor(mid((y + 0.5) / H) - Math.max(2, ws[Math.min(H - 1, y)][0] - 3.5)); if (P.get(x, y) >= 0) { P.set(x, y, n); P.set(x + 1, y, n); if (gx < 0) { gx = x; gy = y; } } }
        if (v < 2 && gx >= 0 && shape !== 'needle') P.glint(gx + 1, gy, 2);
        // wear: nicks out of the margin (variant 0), a browned dry tip (variant 1), a bite and a hole (variant 2)
        if (v === 0) for (let k = 0; k < 2; k++) { const y = Math.floor(H * r.range(0.3, 0.8)), x = Math.floor(mid(y / H) + hw[y] * (k ? -1 : 1) * 0.98); P.cut(x, y); P.cut(x, y + 1); P.cut(x + (k ? 1 : -1), y); }
        if (curl) for (let y = Math.floor(H * 0.88); y < H; y++) for (let x = 0; x < W; x++) { const i = P.get(x, y); if (i >= 0) P.set(x, y, x < mid(y / H) ? 4 : 3, 1); }
        if (v === 2 && !long) { const y = Math.floor(H * r.range(0.25, 0.4)), x = Math.floor(mid(y / H) - hw[y] * 0.45); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1]]) P.cut(x + dx, y + dy); P.nudge(x - 1, y, -2); P.nudge(x, y + 2, -2); P.nudge(x + 1, y + 2, -2); }
      }
      P.sel(0, 1);
      return P;
    });
  }

  /** a needle spray (a conifer twig tip): needles fanning from a short twig, paler at their tips */
  needles(ramp: number[], var_ = 0): Rect {
    return this.get(`needles|${keyOf(ramp)}|${var_}`, 32, 44, (mk) => {
      const P = mk([ramp]), n = ramp.length - 1, r = new Rand(this.seed ^ 0x4ee ^ var_), W = 32;
      for (let y = 0; y < 16; y++) { P.set(W / 2 - 1, y, 2); P.set(W / 2, y, 1); }
      const m = r.int(9, 12);
      for (let k = 0; k < m; k++) {
        const a = (k / (m - 1) - 0.5) * 2.0, by = 2 + k * 1.5, L = r.range(20, 28);
        for (let u = 0; u <= L; u += 0.5) P.set(W / 2 - 0.5 + Math.sin(a) * u * 0.62, by + Math.cos(a) * u * 0.9, u > L * 0.8 ? n : u > L * 0.55 ? n - 1 : a < 0 ? n - 2 : n - 3);
      }
      P.sel(0, 3);
      return P;
    });
  }

  /**
   * A frond strip: the rachis down the middle, leaflets (pinnae) on both sides angled toward the tip, their length
   * following the frond's profile; each pinna lit above with a bright upper edge, shaded below, a midvein on the
   * broad ones. hw: half width (m), len: frond length (m), lmax: longest pinna (m).
   */
  frond(ramps: number[][], rach: number[], o: { len: number; hw: number; lmax: number; fwd: number; wr: number; start: number; shape: Shape; lobes?: boolean; dead?: boolean; var?: number }): Rect {
    const key = `frond|${ramps.map(keyOf).join('/')}|${keyOf(rach)}|${Math.round(o.fwd * 4)}|${o.shape}|${o.lobes ? 1 : 0}|${o.dead ? 1 : 0}|${o.var ?? 0}`;
    const W = 68, H = 224;
    return this.get(key, W, H, (mk) => {
      const P = mk([...ramps, rach]), RI = ramps.length, r = new Rand(this.seed ^ (key.length * 31337) ^ ((o.var ?? 0) * 977));
      const cx = W / 2, pxX = (2 * o.hw) / W, pxY = o.len / H, slope = o.fwd * (pxX / pxY);
      const reach = W / 2 - 3, spacing = Math.max(5.2, Math.min(10, (o.lmax * 0.34) / pxY));
      const prof = PROF[o.shape];
      for (let y0 = o.start * H; y0 < H - 4; y0 += spacing) {
        const t = y0 / H, k = (t - o.start) / (1 - o.start), ll = Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + k * 0.92)), 0.7);
        if (ll < 0.1) continue;
        for (const side of [-1, 1]) {
          if (o.dead && r.chance(0.2)) continue;
          const L = reach * ll * (o.dead ? r.range(0.5, 1) : r.range(0.88, 1)), R = r.int(0, RI - 1), n = P.ramps[R].length - 1;
          const ww = Math.max(2.5, L * o.wr * 0.7);
          for (let u = 0; u <= L; u += 0.5) {
            const f = u / L, x = cx + side * u, y = y0 + u * slope;
            let w = prof(Math.min(0.99, f)) * ww;
            if (o.lobes && Math.floor(u / 2) % 3 === 2) w *= 0.5;
            const cw = Math.ceil(w);
            for (let d = -cw; d <= cw; d++) {
              if (Math.abs(d) > w + 0.25) continue;
              let i = d < 0 ? n - 1 : n - 2;
              if (f > 0.75 && d <= 0) i = n;
              if (d === -cw && f > 0.15 && f < 0.8) i = n;
              if (d === 0 && ww >= 3 && f < 0.8) i = n - 3;
              if (d === cw && cw > 1) i = n - 3;
              P.set(x, y + d, Math.max(1, i), R);
            }
          }
        }
      }
      const rn = rach.length - 1;
      for (let y = 0; y < H - 2; y++) { const t = y / H; P.set(cx - 2, y, rn - 1, RI); P.set(cx - 1, y, rn - 2, RI); if (t < 0.6) P.set(cx, y, rn - 3, RI); }
      // the outline: darkest on the shadow side; the lit edges of the thin leaflets keep a lit step
      P.sel(0, 3);
      return P;
    });
  }

  /** grass and strap blades: n columns, each a blade tapering to a point; a lit edge, the crease, a shaded edge,
   *  sun-cured tips */
  blades(ramps: number[][], dry: number[] | null, n: number, o: { dryP?: number; wide?: boolean; var?: number; pairs?: boolean } = {}): Rect {
    const key = `blades|${ramps.map(keyOf).join('/')}|${dry ? keyOf(dry) : ''}|${n}|${o.dryP ?? 0}|${o.wide ? 1 : 0}|${o.var ?? 0}|${o.pairs ? 1 : 0}`;
    const cw = o.wide ? 16 : 10, H = o.wide ? 88 : 72;
    return this.get(key, cw * n, H, (mk) => {
      const all = dry ? [...ramps, dry] : ramps, P = mk(all), D = dry ? ramps.length : -1, r = new Rand(this.seed ^ (key.length * 4099) ^ ((o.var ?? 0) * 7));
      for (let b = 0; b < n; b++) {
        const R = (o.pairs ? b >> 1 : b) % ramps.length, nr = ramps[R].length - 1;
        const dryFrom = D >= 0 && (o.pairs ? b & 1 : r.chance(o.dryP ?? 0.3)) ? r.range(0.55, 0.8) : 2;
        for (let y = 0; y < H; y++) {
          const t = (y + 0.5) / H, hw = Math.min(1, t * 7 + 0.55) * Math.pow(1 - t, 0.6) * (cw / 2 - 0.8);
          for (let x = 0; x < cw; x++) {
            const s = x + 0.5 - cw / 2;
            if (Math.abs(s) > hw + 0.15 || t > 0.985) continue;
            let i = s < -hw + 1.5 ? nr : s < 0 ? nr - 1 : s < 1 ? nr - 3 : nr - 2;
            if (t < 0.2) i -= 1; else if (t > 0.6 && s < 0) i = nr;
            if (t > dryFrom) { const nd = all[D].length - 1; P.set(b * cw + x, y, s < 0 ? nd - 1 : s < 1 ? nd - 3 : nd - 2, D); }
            else P.set(b * cw + x, y, Math.max(1, i), R);
          }
        }
      }
      P.sel(0, 1);
      return P;
    });
  }

  /** a seed panicle (nodding grass head): seeds in pairs down a fine stalk, each seed lit on its upper face */
  panicle(ramp: number[]): Rect {
    return this.get(`panicle|${keyOf(ramp)}`, 20, 40, (mk) => {
      const P = mk([ramp]), n = ramp.length - 1;
      for (let y = 0; y < 38; y++) P.set(10, y, 2);
      for (let y = 4; y < 38; y += 4) {
        const w = Math.max(2, Math.round((1 - y / 40) * 7));
        for (let k = 1; k <= w; k++) { const yy = y + k * 0.5; P.set(10 - k, yy, k >= w - 1 ? n : n - 1); P.set(10 - k, yy + 1, n - 2); P.set(10 + k, yy, n - 2); P.set(10 + k, yy + 1, n - 3); }
      }
      P.sel(0, 1);
      return P;
    });
  }

  /** a clover leaf: three heart leaflets around a centre, each with a pale chevron and a bright lit edge */
  trefoil(ramp: number[], var_ = 0): Rect {
    return this.get(`trefoil|${keyOf(ramp)}|${var_}`, 32, 32, (mk) => {
      const P = mk([ramp]), n = ramp.length - 1, c = 16;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const dx = x + 0.5 - c, dy = y + 0.5 - c;
        for (let l = 0; l < 3; l++) {
          const a = (l * Math.PI * 2) / 3 + var_ * 0.4, ax = Math.cos(a), ay = Math.sin(a);
          const u = (dx * ax + dy * ay) / 14.4, s = (-dx * ay + dy * ax) / 14.4, lim = Math.sin(Math.PI * Math.pow(Math.max(0, u), 0.7)) * 0.55 * (u > 0.85 && Math.abs(s) < 0.12 ? 0 : 1);
          if (u < 0 || u > 1 || Math.abs(s) > lim) continue;
          let i = dx + dy < 0 ? n - 1 : n - 2;
          if (Math.abs(u - 0.5 - Math.abs(s) * 0.6) < 0.05) i = n;
          if (Math.abs(s) > lim - 0.09 && dx + dy < 0) i = n;
          P.set(x, y, i);
        }
      }
      P.sel(0, 1);
      return P;
    });
  }

  // -------------------------------------------------------------------------------------------- solids
  /** a mushroom cap seen from above (planar mapped): an eight-faceted dome, each facet one ramp step by how it faces
   *  the light, a dark rim with a pale lip, flecks as small drawn clusters, a shine and a glint */
  cap(ramp: number[], spots: number, spotCol: number, var_ = 0): Rect {
    return this.get(`cap|${keyOf(ramp)}|${spots}|${spotCol}|${var_}`, 48, 48, (mk) => {
      const sr = [spotCol, spotCol, spotCol, spotCol];
      const P = mk([ramp, sr, GLINT]), n = ramp.length - 1, c = 24, r = new Rand(this.seed ^ (spotCol & 0xffff) ^ var_);
      const off = r.range(-2, 2), fac = 8;
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
        const dx = x + 0.5 - c - off, dy = y + 0.5 - c, a = Math.atan2(dy, dx), f = Math.floor(((a + Math.PI) / (Math.PI * 2)) * fac + 0.5) % fac;
        const fa = (f / fac) * Math.PI * 2 - Math.PI, face = -(Math.cos(fa) * 0.7 + Math.sin(fa) * 0.7);
        const ring = Math.max(Math.abs(dx), Math.abs(dy)) * 0.6 + (Math.abs(dx) + Math.abs(dy)) * 0.4;
        const crown = ring < 9;
        let i = ring > 21.2 ? 1 : ring > 20 ? (face > 0 ? n - 2 : 2) : crown ? (dx + dy < 0 ? n - 1 : n - 2) : face > 0.3 ? n - 2 : face > -0.3 ? n - 3 : n - 4;
        // facet seams: one step down where two facets meet
        if (!crown && ring < 20 && Math.abs(((a + Math.PI) / (Math.PI * 2)) * fac + 0.5 - Math.round(((a + Math.PI) / (Math.PI * 2)) * fac + 0.5)) < 0.03) i--;
        P.set(x, y, i);
      }
      for (let k = 0; k < spots; k++) {
        const x = Math.floor(r.range(9, 37)), y = Math.floor(r.range(9, 37)), big = r.chance(0.5);
        P.set(x, y, 2, 1); P.set(x + 1, y, 3, 1); P.set(x, y + 1, 1, 1); P.set(x + 1, y + 1, 2, 1);
        if (big) { P.set(x + 2, y, 2, 1); P.set(x - 1, y + 1, 1, 1); P.set(x + 1, y - 1, 3, 1); }
      }
      P.set(c - 9, c - 9, n); P.set(c - 8, c - 9, n); P.set(c - 9, c - 8, n); P.set(c - 7, c - 9, n);
      P.glint(c - 8, c - 10, 2);
      return P;
    });
  }
  /** the underside: radial gills converging on the stem, each gill lit on one face */
  gills(ramp: number[]): Rect {
    return this.get(`gills|${keyOf(ramp)}`, 32, 32, (mk) => {
      const P = mk([ramp]), n = ramp.length - 1;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const dx = x + 0.5 - 16, dy = y + 0.5 - 16, a = Math.atan2(dy, dx), g = Math.sin(a * 14);
        P.set(x, y, Math.max(Math.abs(dx), Math.abs(dy)) < 4.4 ? 1 : g < -0.3 ? 1 : g < 0.2 ? Math.min(n, 2) : Math.min(n, 3));
      }
      return P;
    });
  }
  /** a barrel cactus skin wrapped round its body: lit rib crests, dark furrows, areoles with pale spine stars */
  cactus(ramp: number[], ribs: number, flower: number): Rect {
    const W = ribs * 8;
    return this.get(`cactus|${keyOf(ramp)}|${ribs}|${flower}`, W, 96, (mk) => {
      const spine = M('bone').slice(1, 6);
      const P = mk([ramp, spine, GLINT]), n = ramp.length - 1;
      for (let y = 0; y < 96; y++) for (let x = 0; x < W; x++) {
        const f = x % 8;
        P.set(x, y, f === 0 ? 1 : f < 2 ? n - 3 : f < 4 ? n - 1 : f === 4 ? n : f < 7 ? n - 2 : n - 3);
      }
      for (let k = 0; k < ribs; k++) for (let y = 6 + (k & 1) * 6; y < 96; y += 12) {
        const x = k * 8 + 4;
        P.set(x, y, 4, 1); P.set(x - 1, y, 3, 1); P.set(x, y + 1, 2, 1); P.set(x - 1, y + 1, 1, 1);
        P.set(x - 2, y - 2, 3, 1); P.set(x + 2, y - 2, 2, 1); P.set(x - 3, y - 3, 2, 1); P.set(x + 3, y - 3, 1, 1); P.set(x, y + 3, 2, 1);
      }
      return P;
    });
  }
  /** a ribbed seed pod / lantern bladder: a facet per rib, crease lines, a lit patch high on each facet */
  pod(ramp: number[], ribs: number, glow: boolean): Rect {
    return this.get(`pod|${keyOf(ramp)}|${ribs}|${glow ? 1 : 0}`, 32, 48, (mk) => {
      const P = mk([ramp, GLINT]), n = ramp.length - 1, per = Math.max(4, Math.round(32 / ribs));
      for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) {
        const t = y / 48, f = x % per;
        let i = f === 0 ? n - 4 : f === per - 1 ? n - 4 + 1 : n - 3 + (glow && t > 0.3 && t < 0.7 ? 1 : 0);
        if (f >= 1 && f <= 2 && t > 0.22 && t < 0.48) i = n - 1;
        if (f === 1 && t > 0.26 && t < 0.4) i = n;
        P.set(x, y, Math.max(1, i));
      }
      if (!glow) P.glint(2, 13, 1);
      return P;
    });
  }
  /** an eye: an almond of sclera, an eight-sided iris with a darker ring, a slit pupil and a wet highlight */
  eye(iris: number[]): Rect {
    return this.get(`eye|${keyOf(iris)}`, 32, 32, (mk) => {
      const P = mk([iris, M('bone'), M('ink'), GLINT]), n = iris.length - 1;
      fillPoly([[2, 16], [8, 7], [24, 7], [30, 16], [24, 25], [8, 25]], (x, y) => P.set(x, y, x + y < 32 ? 4 : 2, 1));
      const oct: [number, number][] = [], inner: [number, number][] = [];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.39; oct.push([16 + Math.cos(a) * 8.4, 16 + Math.sin(a) * 8.4]); inner.push([16 + Math.cos(a) * 6.6, 16 + Math.sin(a) * 6.6]); }
      fillPoly(oct, (x, y) => P.set(x, y, 1));
      fillPoly(inner, (x, y) => P.set(x, y, y < 16 ? n - 1 : n - 3));
      for (let y = 9; y < 23; y++) { P.set(16, y, 0, 2); if (y > 11 && y < 21) P.set(15, y, 1, 2); }
      P.glint(11, 10, 3, true);
      return P;
    });
  }
  /** a floating lily pad seen from above: an irregular many-sided pad, a notch to the centre, vein strokes, a lit rim
   *  edge, a wet glint */
  pad(ramp: number[], var_ = 0): Rect {
    return this.get(`pad|${keyOf(ramp)}|${var_}`, 48, 48, (mk) => {
      const P = mk([ramp, GLINT]), n = ramp.length - 1, notch = 0.25 + var_ * 1.7, r = new Rand(this.seed ^ 0x9ad ^ var_);
      const pts: [number, number][] = [[24, 24]], inner: [number, number][] = [[24, 24]];
      for (let k = 0; k <= 14; k++) { const a = notch + 0.28 + (k / 14) * (Math.PI * 2 - 0.56), rr = 22.8 * r.range(0.92, 1.03); pts.push([24 + Math.cos(a) * rr, 24 + Math.sin(a) * rr]); inner.push([24 + Math.cos(a) * (rr - 3), 24 + Math.sin(a) * (rr - 3)]); }
      fillPoly(pts, (x, y) => P.set(x, y, x + y < 48 ? n - 1 : n - 2));
      fillPoly(inner, (x, y) => P.set(x, y, x + y < 46 ? n - 2 : n - 3));
      for (let k = 0; k < 8; k++) { const a = notch + 0.7 + k * 0.68; for (let t = 3; t < 20; t++) { const x = Math.floor(24 + Math.cos(a) * t), y = Math.floor(24 + Math.sin(a) * t); if (P.get(x, y) >= 0) { P.nudge(x, y, 1); P.nudge(x + 1, y, -1); } } }
      P.glint(14, 12, 1, true); P.set(16, 14, n); P.set(17, 14, n);
      P.sel(0, 1);
      return P;
    });
  }
  /** neutral skin for berries, beads and fruit (tinted per vertex): a lit cap, a shadowed base, a glint */
  speckle(): Rect {
    return this.get('speckle', 16, 16, (mk) => {
      const P = mk([M('paper'), GLINT]);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) P.set(x, y, y < 5 ? 3 : y < 11 ? 2 : 1);
      P.set(4, 4, 4); P.set(5, 4, 4); P.set(6, 4, 4); P.set(4, 5, 4);
      P.glint(4, 3, 1);
      return P;
    });
  }
  /** faceted streaks for crystal shards (tinted per vertex): a lit face, a shadow face, a bright arris, a glint */
  crystal(): Rect {
    return this.get('crystal', 16, 32, (mk) => {
      const P = mk([M('paper').slice(1), GLINT]);
      for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) P.set(x, y, x === 5 || (x === 6 && y > 18) ? 4 : x < 6 ? 3 : x < 11 ? 2 : 1);
      for (let y = 4; y < 28; y += 9) { P.nudge(2, y, 1); P.nudge(3, y, 1); P.nudge(9, y + 3, -1); }
      P.glint(3, 6, 1, true);
      return P;
    });
  }
  /** a pitcher's skin wrapped round it: the leaf colour with veins of the accent running up, blotched toward the lip */
  pitcher(ramp: number[], accent: number[]): Rect {
    return this.get(`pitcher|${keyOf(ramp)}|${keyOf(accent)}`, 48, 80, (mk) => {
      const P = mk([ramp, accent, GLINT]), n = ramp.length - 1, m = accent.length - 1, r = new Rand(this.seed ^ 0x9177);
      for (let y = 0; y < 80; y++) for (let x = 0; x < 48; x++) { const f = x % 12; P.set(x, y, f < 2 ? n - 3 : f < 4 ? n - 2 : f < 8 ? n - 1 : f === 8 ? n : n - 2); }
      // veins: one per facet, wandering by a pixel now and then, branching and thickening toward the lip
      for (let k = 0; k < 4; k++) {
        let x = k * 12 + 6;
        for (let y = 0; y < 80; y++) { if (y % 9 === 8) x += r.pick([-1, 1]); P.set(x, y, m - 2, 1); if (y > 48) P.set(x + 1, y, m - 1, 1); if (y % 14 === 10 && y > 20) for (let j = 1; j < 5; j++) P.set(x + j, y - j, m - 3, 1); }
      }
      // blotches near the lip: deliberate 2x2 and 3x2 clusters
      for (let k = 0; k < 16; k++) { const x = r.int(0, 45), y = r.int(56, 76); P.set(x, y, m - 1, 1); P.set(x + 1, y, m - 2, 1); P.set(x, y + 1, m - 2, 1); P.set(x + 1, y + 1, m - 3, 1); if (k & 1) P.set(x + 2, y, m - 2, 1); }
      P.glint(9, 60, 2); P.glint(33, 30, 2);
      return P;
    });
  }
  /** a membrane sail between spines: veins fanning from the root and forking, panels between them in two planes,
   *  a pale band at the free edge */
  membrane(ramp: number[]): Rect {
    return this.get(`membrane|${keyOf(ramp)}`, 64, 64, (mk) => {
      const P = mk([ramp]), n = ramp.length - 1;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const t = y / 64, q = ((x / 64) * 5 + t * 0.6) % 1, vein = Math.abs(q - 0.5) < 0.035, side = q < 0.5;
        P.set(x, y, vein ? n - 4 : t > 0.88 ? n : t > 0.82 ? n - 1 : side ? n - 1 : n - 2);
      }
      for (let k = 0; k < 5; k++) for (let y = 24; y < 52; y++) { const x = Math.floor(((k + 0.5 - (y / 64) * 0.6) / 5) * 64 + (y - 24) * 0.25); P.set(x, y, n - 3); }
      return P;
    });
  }

  /** a snap trap's lobe, unrolled: the left half is the outer face (rim at the left edge, hinge at the centre), the
   *  right half the inner face (hinge at the centre, rim at the right edge). Outside: green planes with veins running
   *  to the rim; inside: the red digestive face set with glands, a green margin, wet glints. Opaque: the mesh is the
   *  silhouette. */
  trap(leafR: number[], accR: number[]): Rect {
    return this.get(`trap|${keyOf(leafR)}|${keyOf(accR)}`, 48, 36, (mk) => {
      const P = mk([leafR, accR, GLINT]), n = leafR.length - 1, m = accR.length - 1, W = 48, H = 36;
      for (let y = 0; y < H; y++) for (let x = 0; x < 24; x++) {
        let i = x > 19 ? n - 3 : x < 3 ? n - 1 : n - 2;
        if (x >= 6 && x <= 13 && y < H * 0.62) i = n - 1;
        if (x === 1 && y > 2 && y < H - 3) i = n;
        P.set(x, y, i);
      }
      for (let y0 = 3; y0 < H - 4; y0 += 6) for (let k = 0; k < 18; k++) { const x = 21 - k, y = y0 + (k >> 1); if (y < H - 1) P.nudge(x, y, -1); }
      for (let y = 0; y < H; y++) for (let x = 24; x < W; x++) {
        const u = x - 24, i = u < 2 ? 1 : u < 17 ? (y < H * 0.55 ? m - 2 : m - 3) : -1;
        if (i >= 0) P.set(x, y, i, 1); else P.set(x, y, u < 21 ? n - 2 : u < 23 ? n - 1 : n, 0);
      }
      for (let row = 0, y = 3; y < H - 3; y += 4, row++) for (let x = 28 + (row & 1) * 2; x < 40; x += 4) { P.set(x, y, m, 1); P.set(x + 1, y, m - 1, 1); P.set(x, y + 1, m - 4, 1); }
      P.glint(31, 8, 2); P.glint(35, 21, 2);
      for (let x = 0; x < W; x++) { const ac = x >= 24 && x <= 40 ? 1 : 0; P.set(x, 0, 0, ac); P.set(x, H - 1, 0, ac); }
      for (let y = 0; y < H; y++) { P.set(0, y, 0); P.set(W - 1, y, 0); P.set(W - 2, y, 1); }
      return P;
    });
  }
  /** a foliose lichen crust: a lobed rosette, older and darker at the heart, a pale growing margin on the lit side,
   *  a few fruiting cups; dark outline */
  lichen(ramp: number[], var_ = 0): Rect {
    return this.get(`lichen|${keyOf(ramp)}|${var_}`, 24, 24, (mk) => {
      const cup = M('rust'), P = mk([ramp, cup]), n = ramp.length - 1, r = new Rand(this.seed ^ 0x11c4e ^ (var_ * 97));
      const lob = [[1, 0.7, 0.95, 0.6, 1, 0.8, 0.55, 0.9, 0.75, 1, 0.65], [0.8, 1, 0.6, 0.9, 0.7, 1, 0.85, 0.5, 0.95, 0.7, 0.9], [0.95, 0.6, 0.8, 1, 0.55, 0.85, 1, 0.7, 0.6, 0.9, 1]][var_ % 3];
      const outer: [number, number][] = [], inner: [number, number][] = [], heart: [number, number][] = [];
      for (let k = 0; k < 11; k++) {
        const a = (k / 11) * Math.PI * 2 + var_, rr = 10.6 * (0.6 + 0.4 * lob[k]), ca = Math.cos(a), sa = Math.sin(a);
        outer.push([12 + ca * rr, 12 + sa * rr]); inner.push([12 + ca * (rr - 2.2), 12 + sa * (rr - 2.2)]); heart.push([12 + ca * rr * 0.42, 12 + sa * rr * 0.42]);
      }
      fillPoly(outer, (x, y) => P.set(x, y, x + y < 24 ? n : n - 2));
      fillPoly(inner, (x, y) => P.set(x, y, x + y < 22 ? n - 1 : n - 2));
      fillPoly(heart, (x, y) => P.set(x, y, n - 3));
      for (let k = 0; k < 11; k += 2) { const a = ((k + 0.5) / 11) * Math.PI * 2 + var_; for (let t = 5; t < 9; t++) P.nudge(12 + Math.cos(a) * t, 12 + Math.sin(a) * t, -1); }
      for (let k = r.int(2, 4); k > 0; k--) { const x = Math.floor(r.range(8, 14)), y = Math.floor(r.range(8, 14)); P.set(x, y, 4, 1); P.set(x + 1, y, 3, 1); P.set(x, y + 1, 2, 1); P.set(x + 1, y + 1, 1, 1); }
      P.sel(0, 1);
      return P;
    });
  }

  /** a small flower head seen from above, built of overlapping drawn petals round a faceted eye (light, tinted per
   *  instance by its bloom colour) */
  floret(form: number): Rect {
    return this.get(`floret|${form}`, 32, 32, (mk) => {
      const P = mk([M('paper'), M('ochre')]), np = [7, 5, 5, 11][form % 4], r = new Rand(this.seed ^ (form * 77));
      for (let p = 0; p < np; p++) {
        const a = (p / np) * Math.PI * 2 + r.range(-0.15, 0.15), L = form === 3 ? 9 : r.range(11.2, 14.4), w = form === 3 ? 2.2 : r.range(3.2, 4.6);
        const ca = Math.cos(a), sa = Math.sin(a), lit = ca + sa < 0;
        fillPoly([[16 + ca * 2.4 - sa * w * 0.4, 16 + sa * 2.4 + ca * w * 0.4], [16 + ca * L * 0.55 - sa * w, 16 + sa * L * 0.55 + ca * w], [16 + ca * L, 16 + sa * L], [16 + ca * L * 0.55 + sa * w, 16 + sa * L * 0.55 - ca * w], [16 + ca * 2.4 + sa * w * 0.4, 16 + sa * 2.4 - ca * w * 0.4]],
          (x, y) => P.set(x, y, lit ? 4 : (p & 1) ? 2 : 3));
        for (let t = 3; t < L * 0.8; t++) P.nudge(16 + ca * t, 16 + sa * t, -1);
      }
      if (form !== 3) for (const [dx, dy, i] of [[-1, -1, 3], [0, -1, 3], [-1, 0, 3], [0, 0, 2], [1, 0, 2], [0, 1, 1], [1, 1, 1], [-2, 0, 2], [-1, 1, 2], [1, -1, 2]] as [number, number, number][]) P.set(16 + dx, 16 + dy, i, 1);
      P.sel(0, 1);
      return P;
    });
  }
}

// ------------------------------------------------------------------------------------------------ bark
/** bark slots (64 px each, tiling vertically, neutral grey: tinted per limb) */
export const BARK = { FURROW: 0, PLATE: 1, RING: 2, STEM: 3, FIBRE: 4, FLESH: 5, SMOOTH: 6, SCALE: 7 } as const;
export const BARK_SLOTS = 8;
const SW = 64, BH = 128;

/** pixel-art bark: plates and fissures drawn as deliberate marks, light from the left of each slot */
function paintBark(seed: number): THREE.DataTexture {
  const W = SW * BARK_SLOTS, d = new Uint8Array(W * BH * 4), r = new Rand(seed ^ 0xba4c);
  const T = [92, 128, 164, 196, 222];
  const put = (s: number, x: number, y: number, v: number, cr = 0, cg = 0, cb = 0) => {
    x = ((Math.floor(x) % SW) + SW) % SW; y = ((Math.floor(y) % BH) + BH) % BH;
    const i = (y * W + s * SW + x) * 4; d[i] = Math.max(0, Math.min(255, v + cr)); d[i + 1] = Math.max(0, Math.min(255, v + cg)); d[i + 2] = Math.max(0, Math.min(255, v + cb)); d[i + 3] = 255;
  };
  for (let s = 0; s < BARK_SLOTS; s++) for (let y = 0; y < BH; y++) for (let x = 0; x < SW; x++) {
    // a round limb: lit on the left third, shaded on the right
    const band = x < 20 ? 3 : x < 44 ? 2 : 1;
    put(s, x, y, s === BARK.STEM || s === BARK.FLESH ? T[band + 1] - 10 : s === BARK.FIBRE || s === BARK.SMOOTH ? T[Math.min(4, band + 2)] : T[band]);
  }
  // furrowed bark: long corky ridges split by dark fissures that wander and fork; each ridge lit on its left lip
  for (let k = 0; k < 7; k++) {
    let x = k * 9.2 + r.range(0, 3);
    for (let y = 0; y < BH; y++) {
      if (r.chance(0.2)) x += r.sign();
      put(BARK.FURROW, x, y, T[0] - 20, 10, 0, -8); put(BARK.FURROW, x + 1, y, T[0] - 8, 8, 0, -6);
      put(BARK.FURROW, x + 2, y, T[3] + 10);
      if (y % 23 === 7) for (let j = 1; j < 5; j++) put(BARK.FURROW, x + 2 + j, y + j, T[0] - 4, 6);
    }
  }
  for (let k = 0; k < 16; k++) { const x = r.int(0, SW - 1), y = r.int(0, BH - 1); put(BARK.FURROW, x, y, T[4]); put(BARK.FURROW, x + 1, y, T[3] + 10); put(BARK.FURROW, x, y + 1, T[1]); }
  // plated bark: rows of different heights, each split into plates of different widths (wrapping round the trunk);
  // a plate is lit along its top and left edge, seamed dark below and right, some split by a vertical crack
  {
    const rows: number[] = []; let acc = 0;
    while (acc < BH) { let h = r.int(12, 20); if (BH - (acc + h) < 12) h = BH - acc; rows.push(h); acc += h; }
    let y0 = 0;
    for (const h of rows) {
      const cuts: number[] = []; let x = r.int(0, 15);
      while (cuts.length === 0 || x < cuts[0] + SW - 9) { cuts.push(x); x += r.int(10, 22); }
      for (let k = 0; k < cuts.length; k++) {
        const a = cuts[k], b = k + 1 < cuts.length ? cuts[k + 1] : cuts[0] + SW, tone = r.pick([0, 6, -6, 10]), crack = r.chance(0.35) ? r.int(a + 4, b - 4) : -1;
        for (let yy = 0; yy < h; yy++) for (let xx = a; xx < b; xx++) {
          const px = xx - a, w = b - a, lit = (xx % SW) < 32;
          let v = (lit ? T[3] : T[2]) + tone;
          if (yy >= h - 2 || px >= w - 2) v = T[0] - (yy === h - 1 || px === w - 1 ? 24 : 12);
          else if (yy === 0 || px === 0) v = (lit ? T[4] : T[3]) + 6;
          else if (yy === 1 || px === 1) v = (lit ? T[4] : T[3]) - 6;
          else if (px > w * 0.6) v -= 14;
          if (xx === crack && yy > 2 && yy < h - 4) v = T[0] - 8;
          put(BARK.PLATE, xx, y0 + yy, v, yy >= h - 2 || px >= w - 2 ? 8 : 0, 0, yy >= h - 2 || px >= w - 2 ? -6 : 0);
        }
      }
      y0 += h;
    }
  }
  // a palm trunk: leaf-scar rings with a diamond weave between them, fibres hanging from each ring
  for (let y = 0; y < BH; y++) for (let x = 0; x < SW; x++) {
    const ry = y % 32;
    if (ry === 0 || ry === 1) put(BARK.RING, x, y, T[0] - 14, 10, 2, -8);
    else if (ry === 2) put(BARK.RING, x, y, T[4]);
    else if (ry === 3) put(BARK.RING, x, y, T[3]);
    else if ((x + ry) % 16 === 0 || (x - ry + 128) % 16 === 0) put(BARK.RING, x, y, T[1]);
    else if (ry < 9 && (x * 7) % 11 === 0) put(BARK.RING, x, y, T[1] - 6);
  }
  // smooth pale bark: long horizontal lenticels, the odd dark eye where a twig fell
  for (let k = 0; k < 26; k++) { const x = r.int(0, SW - 8), y = r.int(0, BH - 1), l = r.int(3, 7); for (let j = 0; j < l; j++) { put(BARK.SMOOTH, x + j, y, T[1]); put(BARK.SMOOTH, x + j, y + 1, T[4]); } }
  for (let k = 0; k < 3; k++) {
    const x = r.int(8, SW - 12), y = r.int(8, BH - 12);
    for (const [dx, dy, v] of [[0, 0, T[0] - 20], [1, 0, T[0] - 20], [0, 1, T[0] - 10], [1, 1, T[0]], [-1, 0, T[1]], [2, 1, T[1]], [0, -1, T[1]], [-1, 2, T[4]], [0, 2, T[4]], [2, -1, T[4]]] as [number, number, number][]) put(BARK.SMOOTH, x + dx, y + dy, v);
  }
  // alien scales: overlapping rows of pointed shields (each row's tips lie over the row below), lit on the upper left,
  // a bright rim along the top, outlined below; every scale its own tone
  for (let row = BH / 8 - 1; row >= 0; row--) for (let c = 0; c < SW / 16 + 1; c++) {
    const x0 = c * 16 + (row & 1) * 8 - 8, y0 = row * 8, tone = ((c * 7 + row * 3) % 4) * 5 - 6;
    for (let py = 0; py < 15; py++) for (let px = 0; px < 16; px++) {
      const half = py < 6 ? 8 : 14 - py;
      if (Math.abs(px + 0.5 - 8) > half) continue;
      const edgeB = py >= 6 && Math.abs(px + 0.5 - 8) > half - 1.2, rim = py <= 1;
      const v = edgeB || py === 14 ? T[0] - 18 : rim ? T[4] + 8 : px < 6 ? T[3] + tone : px < 9 ? T[2] + 10 + tone : T[1] + tone;
      put(BARK.SCALE, x0 + px, y0 + py, v, edgeB ? 4 : 0, 0, edgeB ? 6 : 0);
    }
  }
  // stems: fine lengthwise lines; fibres: pale and dark streaks; flesh: pore clusters
  for (let y = 0; y < BH; y++) { put(BARK.STEM, 12, y, T[4]); put(BARK.STEM, 13, y, T[4] - 10); put(BARK.STEM, 40, y, T[2] - 6); }
  for (let k = 0; k < 12; k++) { const x = r.int(0, SW - 1), dark = k & 1; for (let y = 0; y < BH; y++) if ((y + k * 13) % 23 < 15) put(BARK.FIBRE, x, y, dark ? T[1] : T[4]); }
  for (let k = 0; k < 30; k++) { const x = r.int(0, SW - 2), y = r.int(0, BH - 2); put(BARK.FLESH, x, y, T[1]); put(BARK.FLESH, x + 1, y, T[1] + 10); put(BARK.FLESH, x, y + 1, T[4]); }
  const t = new THREE.DataTexture(d, W, BH, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.NearestMipmapLinearFilter; t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
/** bark u range for a slot (kept off the slot edges so filtering never reaches the neighbour) */
export const barkU = (slot: number, u: number) => (slot * SW + 1 + u * (SW - 2)) / (SW * BARK_SLOTS);
