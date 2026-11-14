// Hand-drawn pixel art for the 3D flora: chunky pixels (1.5x the original texel density), a lot of drawn detail.
// Every leaf, leaflet spray, petal, frond, grass blade, cap, cactus skin and pod is drawn per planet the way a pixel
// artist would: master-palette ramps in clean planes (shadow, base, a lit plane, a bright margin), a midrib and a few
// deliberate vein pixels, each leaf outlined in the darkest step of its own ramp (so overlapping leaflets keep a line
// between them), wear and life marks (nicks, a bite, a hole, a browned tip, hairs, buds, thorns, berries, a dead
// leaflet), and a small specular glint on wet or glossy surfaces. No noise: variety comes from shape, layout, ramp and
// chosen marks. Leaflet sprays (compound and clustered leaves on a twig) let one card carry many small leaves.
// Bark and stems live in a second, vertically tiling texture drawn in neutral tones and tinted per limb.
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
/** texel density relative to the original drawings */
const Q = 1.5;
const q = (n: number) => Math.max(1, Math.round(n * Q));

const keyOf = (ramp: number[]) => ramp.join('.');
const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
/** the glint ramp: specular sparkle on wet leaves, glossy caps, crystals and beads */
const GLINT = M('snow');
/** atlas shelf heights */
const SHELF = [12, 18, 24, 30, 36, 46, 56, 64, 80, 96, 128, 170, 256];
/** toward the light in texture space (upper left) */
const LX = -Math.SQRT1_2, LY = -Math.SQRT1_2;
const PMAX = new Map<Shape, number>();
const pmaxOf = (s: Shape) => { let v = PMAX.get(s); if (v === undefined) { v = 0.01; for (let t = 0; t <= 1; t += 0.02) v = Math.max(v, PROF[s](t)); PMAX.set(s, v); } return v; };

/**
 * A pixel drawing: each texel holds a ramp index (-1 empty) and which ramp it uses. sel() outlines it, ink() writes
 * the colours. Light comes from the upper left of the drawing.
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
  cut(x: number, y: number) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.a[y * this.w + x] = -1; }
  /** a specular glint: a 2 px streak and a pixel below-left, from the glint ramp (index gi) */
  glint(x: number, y: number, gi: number, big = false) {
    if (this.get(x, y) < 0) return;
    this.set(x, y, 5, gi); if (this.get(x + 1, y) >= 0) this.set(x + 1, y, 4, gi); if (big && this.get(x, y + 1) >= 0) this.set(x, y + 1, 4, gi);
  }
  /** the dark coloured outline: every edge texel takes its ramp's darkest steps, darkest away from the light */
  sel(dark = 0, lit = 1) {
    const { w, h, a } = this, src = a.slice();
    const e = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || src[y * w + x] < 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (src[i] < 0) continue;
      const L = e(x - 1, y), Rt = e(x + 1, y), U = e(x, y - 1), D = e(x, y + 1);
      if (!(L || Rt || U || D)) continue;
      if (this.ramps[this.r[i]] === GLINT) this.r[i] = 0;
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

// ------------------------------------------------------------------------------------------------ drawing kit
interface LeafletOpt {
  /** ramp index in the drawing */ ri?: number;
  /** ramp steps added (back leaflets a step darker) */ shade?: number;
  bend?: number; asym?: number; teeth?: boolean;
  /** lateral vein pairs (default by size) */ veins?: number;
  /** midrib: +1 pale, -1 groove */ rib?: number;
  petal?: boolean;
  /** a bite out of the shaded margin at this fraction of the length */ bite?: number;
  hole?: boolean;
  /** the last fraction of the blade curls away (darker) */ curl?: number;
  /** ramp index for a browned, dry tip */ brown?: number;
  /** hairs along the lit margin (ramp index) */ hairs?: number;
  /** glint ramp index */ glint?: number;
}
/**
 * One leaf blade drawn from its spine: from (x0, y0) along ang (texture space radians), length L, full width Wd. The
 * half facing the light is a step brighter with a bright margin, the base a step darker, the tip catches the light;
 * a midrib and a few lateral vein pixels; the leaflet carries its own outline, so where it lies over another a dark
 * line separates them. Returns the tip.
 */
function leaflet(P: Px, x0: number, y0: number, ang: number, L: number, Wd: number, shape: Shape, o: LeafletOpt = {}): [number, number] {
  const R = o.ri ?? 0, n = P.ramps[R].length - 1, prof = PROF[shape], pm = pmaxOf(shape);
  const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx, lit = px * LX + py * LY > 0 ? 1 : -1;
  const bend = o.bend ?? 0, asym = o.asym ?? 0, half0 = Wd / 2, ext = half0 * (1 + Math.abs(asym)) + Math.abs(bend) * L * 0.2 + 1;
  const xa = Math.min(x0, x0 + dx * L) - ext, xb = Math.max(x0, x0 + dx * L) + ext, ya = Math.min(y0, y0 + dy * L) - ext, yb = Math.max(y0, y0 + dy * L) + ext;
  const W = P.w, pix = new Map<number, [number, number, number, number, number]>(); // key -> x, y, tone, ramp, lit side
  const hwAt = (u: number, side: number) => {
    let hw = (prof(Math.min(0.995, Math.max(0, u))) / pm) * half0 * (1 + asym * side);
    if (o.teeth) hw -= (((u * L) % 3) / 3) * 1.1;
    if (o.bite !== undefined && side * lit < 0 && Math.abs(u - o.bite) < 0.14) hw -= (0.14 - Math.abs(u - o.bite)) * L * 0.5;
    return hw;
  };
  for (let y = Math.floor(ya); y <= Math.ceil(yb); y++) for (let x = Math.floor(xa); x <= Math.ceil(xb); x++) {
    if (x < 0 || y < 0 || x >= W || y >= P.h) continue;
    const rx = x + 0.5 - x0, ry = y + 0.5 - y0, u = (rx * dx + ry * dy) / L;
    if (u < 0 || u > 1) continue;
    const v = rx * px + ry * py - bend * u * u * L * 0.18, side = v >= 0 ? 1 : -1, hw = hwAt(u, side);
    if (Math.abs(v) > hw || (u > 0.985 && !o.petal)) continue;
    const onLit = side * lit > 0;
    let t: number, ri = R;
    if (o.petal) { t = (u < 0.15 ? 1 : u < 0.35 ? 2 : u < 0.65 ? 3 : 4) + (onLit ? 1 : 0); if (onLit && Math.abs(v) > hw - 1.3 && u > 0.3) t = n; }
    else {
      t = onLit ? n - 2 : n - 3;
      if (u < 0.16) t--;
      if (u > 0.72 && onLit) t = n - 1;
      if (onLit && Math.abs(v) > hw - 1.3 && u > 0.2 && u < 0.86) t = n - 1;
      if (o.curl && u > 1 - o.curl) t = onLit ? n - 2 : n - 3;
      if (Math.abs(v) < 0.55 && u < 0.9 && L >= 8) t += o.rib ?? 1;
      if (o.brown !== undefined && u > 0.84) { ri = o.brown; t = onLit ? 4 : 3; }
    }
    t += o.shade ?? 0;
    pix.set(y * W + x, [x, y, t, ri, onLit ? 1 : 0]);
  }
  // lateral veins: a few deliberate pixel lines sweeping toward the tip, light on the lit half, dark on the other
  const nv = o.petal ? 0 : o.veins ?? (L >= 15 && Wd >= 7 ? 3 : L >= 9 && Wd >= 5 ? 2 : 0);
  for (let k = 0; k < nv; k++) {
    const uk = 0.24 + (k * 0.56) / Math.max(1, nv);
    for (const s of [-1, 1]) for (let tt = 1; tt < half0; tt += 1) {
      const u = uk + (tt * 0.85) / L; if (u > 0.95 || tt > hwAt(u, s) - 1.4) break;
      const m = bend * u * u * L * 0.18, X = Math.floor(x0 + dx * u * L + px * (m + s * tt)), Y = Math.floor(y0 + dy * u * L + py * (m + s * tt)), e = pix.get(Y * W + X);
      if (e && e[3] === R) e[2] += s * lit > 0 ? 1 : -1;
    }
  }
  if (o.hole) { const u = 0.42, s = -lit, m = bend * u * u * L * 0.18; for (const [a, b] of [[0, 0], [1, 0], [0, 1]]) { const X = Math.floor(x0 + dx * u * L + px * (m + s * half0 * 0.45)) + a, Y = Math.floor(y0 + dy * u * L + py * (m + s * half0 * 0.45)) + b; pix.delete(Y * W + X); } }
  // the leaflet's own outline, then ink
  for (const e of pix.values()) {
    const [x, y] = e, has = (a: number, b: number) => pix.has((y + b) * W + x + a);
    if (!has(1, 0) || !has(0, 1)) e[2] = Wd < 4.5 ? Math.min(e[2], 1) : 0; else if (!has(-1, 0) || !has(0, -1)) e[2] = Wd < 4.5 ? e[2] : Math.min(e[2], 1);
    P.set(x, y, e[2], e[3]);
  }
  if (o.hairs !== undefined) {
    let c = 0;
    for (const e of pix.values()) {
      if (!e[4] || (c++ % 3)) continue;
      const [x, y] = e, ox = px * lit > 0 ? 1 : px * lit < -0.3 ? -1 : 0, oy = py * lit > 0 ? 1 : py * lit < -0.3 ? -1 : 0;
      if (P.get(x + ox, y + oy) < 0 && !pix.has((y + oy) * W + x + ox)) P.set(x + ox, y + oy, n, o.hairs);
    }
  }
  if (o.glint !== undefined && !o.petal && L >= 9) {
    const u = 0.58, m = bend * u * u * L * 0.18, gx = Math.floor(x0 + dx * u * L + px * (m + lit * half0 * 0.45)), gy = Math.floor(y0 + dy * u * L + py * (m + lit * half0 * 0.45));
    if (pix.has(gy * W + gx) && pix.has(gy * W + gx + 1)) P.glint(gx, gy, o.glint);
  }
  return [x0 + dx * L, y0 + dy * L];
}
/** a twig or rachis stroke, w px wide, lit along its upper-left edge, outlined dark */
function stroke(P: Px, x0: number, y0: number, x1: number, y1: number, w: number, ri: number) {
  const n = P.ramps[ri].length - 1, L = Math.hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / (L || 1), dy = (y1 - y0) / (L || 1), px = -dy, py = dx, lit = px * LX + py * LY > 0 ? 1 : -1;
  for (let t = 0; t <= L; t += 0.5) for (let s = -w / 2 + 0.25; s <= w / 2 - 0.25 + 1e-6; s += 0.5) {
    const ww = Math.max(0.5, w * (1 - (t / L) * 0.35)) / 2; if (Math.abs(s) > ww) continue;
    P.set(x0 + dx * t + px * s, y0 + dy * t + py * s, w < 1.6 ? 1 : s * lit > 0 ? n - 2 : 1, ri);
  }
}
/** a berry: a hand-set 4 x 4 faceted cluster (glint, lit plane, shadow, dark rim) */
function berry(P: Px, x: number, y: number, ri: number, gi: number) {
  const n = P.ramps[ri].length - 1;
  const pat = [[-1, n - 2, n - 3, -1], [n - 1, n - 1, n - 3, 1], [n - 2, n - 3, n - 4, 0], [-1, 1, 0, -1]];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (pat[j][i] >= 0) P.set(x + i, y + j, pat[j][i], ri);
  P.set(x + 1, y + 1, 5, gi);
}
/** a bud: a pointed 2-3 px cluster, light tip, dark base */
function bud(P: Px, x: number, y: number, dx: number, dy: number, ri: number) {
  const n = P.ramps[ri].length - 1;
  P.set(x, y, 1, ri); P.set(x + dx, y + dy, n - 2, ri); P.set(x + dx * 2, y + dy * 2, n, ri); P.set(x + dx - dy, y + dy + dx, 0, ri);
}

export type SprayStyle = 'alternate' | 'pinnate' | 'palmate' | 'trifoliate' | 'whorl' | 'needle' | 'bipinnate';

export class FloraTex {
  readonly S = FLORA_ATLAS; readonly SH = FLORA_ATLAS_H;
  readonly data: Uint8Array;
  readonly tex: THREE.DataTexture;
  /** bark and stems: 8 neutral slots of 48 x 96, tiling vertically */
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
  /** upload once everything is painted, with a hand-built mip chain for the cut-out cards: each coarser texel takes
   *  the colour of its opaque children only (no dark fringe bleeding in, so fine fronds stay green) and their mean
   *  coverage as alpha (the shader's mip-level alpha bias then keeps thin leaflets as a solid silhouette instead of
   *  letting them fall apart into a see-through grid) */
  finish() {
    const t = this.tex, levels: { data: Uint8Array; width: number; height: number }[] = [{ data: this.data, width: this.S, height: this.SH }];
    let src = this.data, w = this.S, h = this.SH;
    while (w > 1 || h > 1) {
      const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1), out = new Uint8Array(nw * nh * 4);
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let k = 0; k < 4; k++) {
          const i = ((Math.min(h - 1, y * 2 + (k >> 1))) * w + Math.min(w - 1, x * 2 + (k & 1))) * 4, al = src[i + 3];
          a += al; if (al > 0) { r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al; n += al; }
        }
        const o = (y * nw + x) * 4, i0 = (y * 2 * w + x * 2) * 4;
        if (n > 0) { out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; } else { out[o] = src[i0]; out[o + 1] = src[i0 + 1]; out[o + 2] = src[i0 + 2]; }
        out[o + 3] = a / 4;
      }
      levels.push({ data: out, width: nw, height: nh });
      src = out; w = nw; h = nh;
    }
    t.mipmaps = levels; t.generateMipmaps = false; t.minFilter = THREE.NearestMipmapLinearFilter;
    t.needsUpdate = true;
  }

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
    const rc = { u0: x0 / S, v0: y0 / this.SH, du: w / S, dv: h / this.SH };
    this.cache.set(key, rc);
    if (!this.fallback) this.fallback = rc;
    return rc;
  }

  // -------------------------------------------------------------------------------------------- leaves
  /** A single leaf (or petal) along +v, base at v0: drawn by leaflet(), with wear by variant (nicks and a glint, a
   *  browned curled tip, a bite and a hole, hairs). */
  leaf(shape: Shape, ramp: number[], o: { vein?: number; lat?: boolean; teeth?: boolean; petal?: boolean; var?: number; hairs?: boolean } = {}): Rect {
    const key = `leaf|${shape}|${keyOf(ramp)}|${o.vein ?? 0}|${o.lat ? 1 : 0}|${o.teeth ? 1 : 0}|${o.petal ? 1 : 0}|${o.var ?? 0}|${o.hairs ? 1 : 0}`;
    const long = shape === 'strap' || shape === 'lance' || shape === 'needle' || shape === 'linear' || shape === 'falcate';
    const W = o.petal ? q(14) : long ? q(12) : q(16), H = o.petal ? q(18) : long ? q(36) : q(30);
    return this.get(key, W, H, (mk) => {
      const P = mk([ramp, M('ochre'), GLINT]), v = o.var ?? 0, r = new Rand(this.seed ^ (key.length * 7919) ^ (v * 131));
      const bend = (v === 1 ? 1 : v === 2 ? -0.7 : 0.4) * r.range(0.6, 1.2), asym = (v === 2 ? -1 : 1) * r.range(0.08, 0.2);
      leaflet(P, W / 2 + (o.petal ? 0 : -bend * 0.6), 0, Math.PI / 2, H - 0.5, W - 2, shape, {
        petal: o.petal, bend: o.petal ? bend * 0.3 : bend, asym, teeth: o.teeth, rib: (o.vein ?? 0) < 0 ? -1 : 1, veins: o.lat || !long ? undefined : 1,
        bite: !o.petal && v === 2 ? r.range(0.4, 0.62) : undefined, hole: !o.petal && v === 2 && !long, curl: !o.petal && v === 1 ? 0.14 : 0,
        brown: !o.petal && v === 3 ? 1 : undefined, hairs: o.hairs ? 0 : undefined, glint: !o.petal && v < 2 ? 2 : undefined,
      });
      if (!o.petal && v === 0) for (let k = 0; k < 2; k++) { const y = Math.floor(H * r.range(0.35, 0.8)); for (let x = k ? 0 : W - 1; k ? x < W : x >= 0; x += k ? 1 : -1) if (P.get(x, y) >= 0) { P.cut(x, y); P.nudge(x + (k ? 1 : -1), y, -1); break; } }
      return P;
    });
  }

  /**
   * A leaf spray: many small leaves on one card. A twig (or a rachis) runs up from v0; the leaves are arranged by
   * style: alternate along the twig with a terminal bud, pinnate pairs with a terminal leaflet, palmate or trifoliate
   * from the petiole's tip, a whorl at the twig's end, needles, or bipinnate fronds of tiny leaflets. Variants add
   * life: a bud and hairs, a dead leaflet and a bite, berries, thorns along the twig.
   */
  spray(style: SprayStyle, shape: Shape, ramp: number[], o: { var?: number; twig?: number[]; berry?: number[]; thorns?: boolean; hairs?: boolean; young?: number[] } = {}): Rect {
    const v = o.var ?? 0, key = `spray|${style}|${shape}|${keyOf(ramp)}|${v}|${o.berry ? keyOf(o.berry) : ''}|${o.thorns ? 1 : 0}|${o.hairs ? 1 : 0}`;
    const W = q(28), H = q(36);
    return this.get(key, W, H, (mk) => {
      const twig = o.twig ?? M('fur'), young = o.young ?? ramp, ber = o.berry ?? M('ruby');
      const P = mk([ramp, young, M('ochre'), twig, ber, GLINT]), r = new Rand(this.seed ^ (key.length * 4421) ^ (v * 2741));
      const TW = 3, YG = 1, BR = 2, BE = 4, GL = 5, cx = W / 2 + r.range(-1, 1);
      const deadAt = v === 2 ? r.int(0, 3) : -1, hairs = o.hairs ? YG : undefined;
      const long = shape === 'lance' || shape === 'linear' || shape === 'falcate' || shape === 'strap';
      const wr = long ? 0.3 : shape === 'fan' || shape === 'round' || shape === 'deltoid' ? 0.62 : 0.48;
      let li = 0;
      // a leaf at (x, y) along ang, shortened so its tip stays on the card
      const room = (v: number, d: number, lo: number, hi: number) => (d > 1e-3 ? (hi - v) / d : d < -1e-3 ? (lo - v) / d : 1e9);
      const leaf = (x: number, y: number, ang: number, L: number, back = false) => {
        L = Math.min(L, room(x, Math.cos(ang), 2, W - 3), room(y, Math.sin(ang), 1, H - 2));
        if (L < 3) return;
        const dead = li === deadAt, k = li++;
        leaflet(P, x, y, ang, L, Math.max(3, L * wr), dead ? 'falcate' : shape, {
          ri: dead ? BR : k % 4 === 3 ? YG : 0, shade: back ? -1 : 0, bend: r.range(-0.5, 0.5), asym: r.range(-0.15, 0.15), teeth: shape === 'serrate',
          bite: v === 2 && k === 1 ? 0.5 : undefined, curl: dead ? 0.3 : 0, hairs, glint: !back && k === 2 && v !== 2 ? GL : undefined, veins: L < 10 ? 0 : undefined,
        });
      };
      if (style === 'needle') {
        // a fir sprig: needles in two ranks, each a fine stroke from a dark base to a pale tip, younger and paler
        // toward the growing end, a side shoot, a resting bud
        const tx = cx + r.range(-2, 2);
        stroke(P, cx, 0, tx, H - 4, 2, TW);
        const shoot = r.chance(0.6) ? r.range(0.3, 0.5) : -1;
        if (shoot > 0) stroke(P, cx, H * shoot, cx + (r.chance(0.5) ? 1 : -1) * W * 0.32, H * (shoot + 0.3), 1, TW);
        for (let y = 2; y < H - 4; y += 2.5) for (const s of [-1, 1]) {
          const t0 = y / H, L = q(9) * (1 - t0 * 0.4), a = Math.PI / 2 - s * (0.75 + r.range(-0.1, 0.1)), bx = cx + (tx - cx) * t0, ri = t0 > 0.7 ? YG : 0;
          for (let t = 0; t < L; t += 0.5) P.set(bx + Math.cos(a) * t, y + Math.sin(a) * t, t < 1.5 ? 1 : t > L * 0.75 ? 6 : s < 0 ? 5 : 3, ri);
        }
        bud(P, Math.floor(tx), H - 4, 0, 1, YG);
      } else if (style === 'pinnate' || style === 'bipinnate') {
        const top = H - 2, pairs = style === 'bipinnate' ? r.int(3, 4) : r.int(3, 5), alt = r.chance(0.35);
        stroke(P, cx, 0, cx, top - q(5), style === 'bipinnate' ? 1.5 : 2, TW);
        for (let k = pairs - 1; k >= 0; k--) {
          const y = q(4) + (k * (top - q(10))) / pairs, L = (style === 'bipinnate' ? q(11) : q(10)) * (1 - k * 0.08);
          for (const s of [-1, 1]) {
            const yy = y + (alt && s > 0 ? q(2) : 0), a = Math.PI / 2 - s * r.range(0.95, 1.2);
            if (style === 'bipinnate') {
              // a pinna: a fine rachis lined with tiny leaflets
              const ex = cx + Math.cos(a) * L, ey = yy + Math.sin(a) * L; stroke(P, cx, yy, ex, ey, 1, TW);
              for (let t = 2; t < L; t += 2) for (const s2 of [-1, 1]) { const bx = cx + Math.cos(a) * t, by = yy + Math.sin(a) * t, a2 = a + s2 * 1.1; leaflet(P, bx, by, a2, 4.5, 3, 'lance', { ri: (t & 2) ? 0 : YG, veins: 0 }); }
            } else leaf(cx, yy, a, L, s > 0);
          }
        }
        if (style === 'pinnate') leaf(cx, top - q(6), Math.PI / 2, q(7));
      } else if (style === 'palmate' || style === 'trifoliate') {
        const py = H * (style === 'palmate' ? 0.32 : 0.38), n = style === 'palmate' ? r.int(5, 7) : 3, spread = style === 'palmate' ? 2.4 : 1.6;
        stroke(P, cx, 0, cx, py, 2, TW);
        const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => Math.abs(b - (n - 1) / 2) - Math.abs(a - (n - 1) / 2));
        for (const k of order) { const f = n === 1 ? 0 : k / (n - 1) - 0.5, a = Math.PI / 2 + f * spread, L = (H - py - 1) * (1 - Math.abs(f) * 0.55); leaf(cx, py, a, L, Math.abs(f) > 0.3); }
      } else if (style === 'whorl') {
        const py = H * 0.3, n = r.int(5, 7);
        stroke(P, cx, 0, cx, py, 2, TW);
        for (let k = 0; k < n; k++) { const f = k / (n - 1) - 0.5, a = Math.PI / 2 + f * 3.0, L = (H - py) * (0.62 + 0.3 * (1 - Math.abs(f))); leaf(cx, py, a, Math.min(L, H * 0.62), k % 2 === 1); }
        bud(P, Math.floor(cx), Math.floor(py) + 1, 0, 1, YG);
      } else {
        // alternate: a zigzag twig, a leaf at each node on its own short petiole, the newest leaves small and pale
        const n = r.int(4, 6), nodes: [number, number][] = [];
        let x = cx, y = 0;
        for (let k = 0; k <= n; k++) { const nx = cx + (k % 2 ? 1 : -1) * r.range(0.5, 2), ny = Math.min(H - 4, (k + 1) * ((H - 6) / (n + 1))); stroke(P, x, y, nx, ny, k < 2 ? 2 : 1.5, TW); nodes.push([nx, ny]); x = nx; y = ny; }
        for (let k = n - 1; k >= 0; k--) {
          const [nx, ny] = nodes[k], s = k % 2 ? 1 : -1, a = Math.PI / 2 - s * r.range(0.8, 1.15), L = q(12) * (1 - (k / n) * 0.45);
          const ex = nx + Math.cos(a) * 1.5, ey = ny + Math.sin(a) * 1.5; stroke(P, nx, ny, ex, ey, 1, TW);
          leaf(ex, ey, a + s * 0.15, L, s > 0);
        }
        bud(P, Math.floor(x), Math.floor(y) + 1, 0, 1, YG);
      }
      // life: thorns along the twig, berries in a little bunch, a second bud
      if (o.thorns) for (let y = 3; y < H * 0.4; y += 4) { const s = (y >> 2) & 1 ? 1 : -1; P.set(cx + s * 1.5, y, 0, TW); P.set(cx + s * 2.5, y + 1, 1, TW); }
      // a little inflorescence of buds in the accent colour on short pedicels (fruit is the ecosystem's, not drawn)
      if (v === 3 && o.berry) { const by = Math.floor(H * 0.14); for (const [bx, dy] of [[-3, 2], [2, 3], [0, 5]]) { stroke(P, cx, by, cx + bx, by + dy, 1, TW); bud(P, Math.floor(cx + bx), by + dy, bx < 0 ? -1 : bx > 0 ? 1 : 0, 1, BE); } }
      void berry;
      if (v === 1 && style !== 'needle') bud(P, Math.floor(cx) + 2, Math.floor(H * 0.22), 1, 1, YG);
      return P;
    });
  }

  /** a needle spray (a conifer twig tip): needles fanning from a short twig, paler at their tips */
  needles(ramp: number[], var_ = 0): Rect {
    return this.get(`needles|${keyOf(ramp)}|${var_}`, q(16), q(22), (mk) => {
      const P = mk([ramp]), n = ramp.length - 1, r = new Rand(this.seed ^ 0x4ee ^ var_), W = q(16);
      for (let y = 0; y < q(8); y++) { P.set(W / 2 - 1, y, 2); P.set(W / 2, y, 1); }
      const m = r.int(8, 11);
      for (let k = 0; k < m; k++) {
        const a = (k / (m - 1) - 0.5) * 2.0, by = 1 + k * 1.2, L = r.range(q(10), q(14));
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
  frond(ramps: number[][], rach: number[], o: { len: number; hw: number; lmax: number; fwd: number; wr: number; start: number; shape: Shape; lobes?: boolean; dead?: boolean; var?: number; solid?: boolean }): Rect {
    const key = `frond|${ramps.map(keyOf).join('/')}|${keyOf(rach)}|${Math.round(o.fwd * 4)}|${o.shape}|${o.lobes ? 1 : 0}|${o.dead ? 1 : 0}|${o.var ?? 0}|${o.solid ? 1 : 0}`;
    const W = q(34) + 1, H = q(112);
    return this.get(key, W, H, (mk) => {
      const P = mk([...ramps, rach, M('ochre')]), RI = ramps.length, BR = RI + 1, r = new Rand(this.seed ^ (key.length * 31337) ^ ((o.var ?? 0) * 977));
      const cx = W / 2, pxX = (2 * o.hw) / W, pxY = o.len / H, slope = o.fwd * (pxX / pxY);
      const reach = W / 2 - 2, spacing = Math.max(q(2.6), Math.min(q(5), (o.lmax * 0.34) / pxY));
      const prof = PROF[o.shape];
      let pi = 0;
      if (o.solid) {
        // the mid-range frond: its silhouette filled first with the shaded backs of the leaflets behind, so the
        // drawn leaflets read as one green blade instead of a see-through comb
        for (let y = Math.floor(o.start * H); y < H - 3; y++) {
          const t = y / H, k = (t - o.start) / (1 - o.start), ll = Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + k * 0.92)), 0.7), L = reach * ll * 0.9;
          for (let u = 0; u < L; u += 0.5) for (const side of [-1, 1]) { const yy = y + u * slope * 0.92; P.set(cx + side * u, yy, u > L * 0.8 ? P.ramps[0].length - 3 : P.ramps[0].length - 4, 0); }
        }
      }
      for (let y0 = o.start * H; y0 < H - 3; y0 += spacing) {
        const t = y0 / H, k = (t - o.start) / (1 - o.start), ll = Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + k * 0.92)), 0.7);
        if (ll < 0.1) continue;
        for (const side of [-1, 1]) {
          if (o.dead && r.chance(0.2)) continue;
          const L = reach * ll * (o.dead ? r.range(0.5, 1) : r.range(0.88, 1)), dry = !o.dead && pi++ % 23 === 11, R = dry ? BR : r.int(0, RI - 1), n = P.ramps[R].length - 1;
          const ww = Math.max(2, L * o.wr * 0.62);
          for (let u = 0; u <= L; u += 0.5) {
            const f = u / L, x = cx + side * u, y = y0 + u * slope;
            let w = prof(Math.min(0.99, f)) * ww;
            if (o.lobes && Math.floor(u / Q) % 3 === 2) w *= 0.5;
            const cw = Math.ceil(w);
            for (let d = -cw; d <= cw; d++) {
              if (Math.abs(d) > w + 0.25) continue;
              let i = d < 0 ? n - 1 : n - 2;
              if (f > 0.75 && d <= 0) i = n - 1;
              if (d === -cw && f > 0.15 && f < 0.8) i = n;
              if (d === 0 && ww >= 2.5 && f < 0.8) i = n - 3;
              if (d === cw && cw > 1) i = n - 3;
              P.set(x, y + d, Math.max(1, i), R);
            }
          }
        }
      }
      const rn = rach.length - 1;
      for (let y = 0; y < H - 2; y++) { const t = y / H; P.set(cx - 1, y, rn - 1, RI); P.set(cx, y, rn - 2, RI); if (t < 0.5) P.set(cx + 1, y, rn - 3, RI); }
      P.sel(0, 3);
      return P;
    });
  }

  /** grass and strap blades: n columns, each a blade tapering to a point; a lit edge, the crease, a shaded edge,
   *  sun-cured tips */
  blades(ramps: number[][], dry: number[] | null, n: number, o: { dryP?: number; wide?: boolean; var?: number; pairs?: boolean } = {}): Rect {
    const key = `blades|${ramps.map(keyOf).join('/')}|${dry ? keyOf(dry) : ''}|${n}|${o.dryP ?? 0}|${o.wide ? 1 : 0}|${o.var ?? 0}|${o.pairs ? 1 : 0}`;
    const cw = o.wide ? 12 : 8, H = o.wide ? q(44) : q(36);
    return this.get(key, cw * n, H, (mk) => {
      const all = dry ? [...ramps, dry] : ramps, P = mk(all), D = dry ? ramps.length : -1, r = new Rand(this.seed ^ (key.length * 4099) ^ ((o.var ?? 0) * 7));
      for (let b = 0; b < n; b++) {
        const R = (o.pairs ? b >> 1 : b) % ramps.length, nr = ramps[R].length - 1;
        const dryFrom = D >= 0 && (o.pairs ? b & 1 : r.chance(o.dryP ?? 0.3)) ? r.range(0.55, 0.8) : 2;
        for (let y = 0; y < H; y++) {
          const t = (y + 0.5) / H, hw = Math.min(1, t * 7 + 0.55) * Math.pow(1 - t, 0.6) * (cw / 2 - 0.7);
          for (let x = 0; x < cw; x++) {
            const s = x + 0.5 - cw / 2;
            if (Math.abs(s) > hw + 0.15 || t > 0.985) continue;
            let i = s < -hw + 1.2 ? nr : s < 0 ? nr - 1 : s < 1 ? nr - 3 : nr - 2;
            if (t < 0.2) i -= 1; else if (t > 0.6 && s < 0) i = nr;
            if (t > dryFrom) { const nd = all[D].length - 1; P.set(b * cw + x, y, s < 0 ? nd - 1 : s < 1 ? nd - 3 : nd - 2, D); }
            else P.set(b * cw + x, y, Math.max(1, i), R);
          }
        }
      }
      P.sel(0, 2);
      return P;
    });
  }

  /** a seed panicle (nodding grass head): seeds in pairs down a fine stalk, each seed lit on its upper face */
  panicle(ramp: number[]): Rect {
    const W = q(10) + 1, H = q(20);
    return this.get(`panicle|${keyOf(ramp)}`, W, H, (mk) => {
      const P = mk([ramp]), n = ramp.length - 1, c = Math.floor(W / 2);
      for (let y = 0; y < H - 1; y++) P.set(c, y, 2);
      for (let y = 3; y < H - 1; y += 3) { const w = Math.max(1, Math.round((1 - y / H) * q(3.5))); for (let k = 1; k <= w; k++) { const yy = y + k * 0.5; P.set(c - k, yy, k >= w ? n : n - 1); P.set(c + k, yy, n - 2); P.set(c + k, yy + 1, n - 3); } }
      P.sel(0, 2);
      return P;
    });
  }

  /** a clover leaf: three heart leaflets around a centre, each with a pale chevron and a bright lit edge */
  trefoil(ramp: number[], var_ = 0): Rect {
    const S = q(16), c = S / 2, rr = S * 0.45;
    return this.get(`trefoil|${keyOf(ramp)}|${var_}`, S, S, (mk) => {
      const P = mk([ramp]), n = ramp.length - 1;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = x + 0.5 - c, dy = y + 0.5 - c;
        for (let l = 0; l < 3; l++) {
          const a = (l * Math.PI * 2) / 3 + var_ * 0.4, ax = Math.cos(a), ay = Math.sin(a);
          const u = (dx * ax + dy * ay) / rr, s = (-dx * ay + dy * ax) / rr, lim = Math.sin(Math.PI * Math.pow(Math.max(0, u), 0.7)) * 0.55 * (u > 0.85 && Math.abs(s) < 0.12 ? 0 : 1);
          if (u < 0 || u > 1 || Math.abs(s) > lim) continue;
          let i = dx + dy < 0 ? n - 1 : n - 2;
          if (Math.abs(u - 0.5 - Math.abs(s) * 0.6) < 0.06) i = n;
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
    const S = q(24), c = S / 2;
    return this.get(`cap|${keyOf(ramp)}|${spots}|${spotCol}|${var_}`, S, S, (mk) => {
      const sr = [spotCol, spotCol, spotCol, spotCol];
      const P = mk([ramp, sr, GLINT]), n = ramp.length - 1, r = new Rand(this.seed ^ (spotCol & 0xffff) ^ var_);
      const off = r.range(-1.5, 1.5), fac = 8, k = S / 48;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = x + 0.5 - c - off, dy = y + 0.5 - c, a = Math.atan2(dy, dx), fp = ((a + Math.PI) / (Math.PI * 2)) * fac + 0.5, f = Math.floor(fp) % fac;
        const fa = (f / fac) * Math.PI * 2 - Math.PI, face = -(Math.cos(fa) * 0.7 + Math.sin(fa) * 0.7);
        const ring = (Math.max(Math.abs(dx), Math.abs(dy)) * 0.6 + (Math.abs(dx) + Math.abs(dy)) * 0.4) / k;
        const crown = ring < 9;
        let i = ring > 21.2 ? 1 : ring > 19.4 ? (face > 0 ? n - 2 : 2) : crown ? (dx + dy < 0 ? n - 1 : n - 2) : face > 0.3 ? n - 2 : face > -0.3 ? n - 3 : n - 4;
        if (!crown && ring < 19.4 && Math.abs(fp - Math.round(fp)) < 0.04) i--;
        P.set(x, y, i);
      }
      for (let s = 0; s < spots; s++) {
        const x = Math.floor(r.range(S * 0.2, S * 0.76)), y = Math.floor(r.range(S * 0.2, S * 0.76));
        P.set(x, y, 2, 1); P.set(x + 1, y, 3, 1); P.set(x, y + 1, 1, 1); if (r.chance(0.5)) P.set(x + 1, y + 1, 2, 1);
      }
      const hx = Math.floor(c - S * 0.19), hy = Math.floor(c - S * 0.19);
      P.set(hx, hy, n); P.set(hx + 1, hy, n); P.set(hx, hy + 1, n);
      P.glint(hx + 1, hy - 1, 2);
      return P;
    });
  }
  /** the underside: radial gills converging on the stem, each gill lit on one face */
  gills(ramp: number[]): Rect {
    const S = q(16), c = S / 2;
    return this.get(`gills|${keyOf(ramp)}`, S, S, (mk) => {
      const P = mk([ramp]), n = ramp.length - 1;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = x + 0.5 - c, dy = y + 0.5 - c, g = Math.sin(Math.atan2(dy, dx) * 11);
        P.set(x, y, Math.max(Math.abs(dx), Math.abs(dy)) < S * 0.14 ? 1 : g < -0.3 ? 1 : g < 0.2 ? Math.min(n, 2) : Math.min(n, 3));
      }
      return P;
    });
  }
  /** a barrel cactus skin wrapped round its body: lit rib crests, dark furrows, areoles with pale spine stars */
  cactus(ramp: number[], ribs: number, flower: number): Rect {
    const W = ribs * 6, H = q(48);
    return this.get(`cactus|${keyOf(ramp)}|${ribs}|${flower}`, W, H, (mk) => {
      const spine = M('bone').slice(1, 6);
      const P = mk([ramp, spine]), n = ramp.length - 1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const f = x % 6; P.set(x, y, f === 0 ? 1 : f === 1 ? n - 3 : f < 3 ? n - 1 : f === 3 ? n : f === 4 ? n - 2 : n - 3); }
      for (let k = 0; k < ribs; k++) for (let y = 4 + (k & 1) * 5; y < H; y += 9) {
        const x = k * 6 + 3;
        P.set(x, y, 4, 1); P.set(x - 1, y, 3, 1); P.set(x, y + 1, 1, 1); P.set(x - 2, y - 2, 3, 1); P.set(x + 2, y - 2, 2, 1); P.set(x, y + 2, 2, 1);
      }
      return P;
    });
  }
  /** a ribbed seed pod / lantern bladder: a facet per rib, crease lines, a lit patch high on each facet */
  pod(ramp: number[], ribs: number, glow: boolean): Rect {
    const W = q(16), H = q(24);
    return this.get(`pod|${keyOf(ramp)}|${ribs}|${glow ? 1 : 0}`, W, H, (mk) => {
      const P = mk([ramp, GLINT]), n = ramp.length - 1, per = Math.max(3, Math.round(W / ribs));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const t = y / H, f = x % per;
        let i = f === 0 ? n - 4 : n - 3 + (glow && t > 0.3 && t < 0.7 ? 1 : 0);
        if (f === 1 && t > 0.22 && t < 0.48) i = n - 1;
        if (f === 1 && t > 0.26 && t < 0.36) i = n;
        P.set(x, y, Math.max(1, i));
      }
      if (!glow) P.glint(1, Math.floor(H * 0.28), 1);
      return P;
    });
  }
  /** an eye: an almond of sclera, an eight-sided iris with a darker ring, a slit pupil and a wet highlight */
  eye(iris: number[]): Rect {
    const S = q(16), k = S / 32;
    return this.get(`eye|${keyOf(iris)}`, S, S, (mk) => {
      const P = mk([iris, M('bone'), M('ink'), GLINT]), n = iris.length - 1, c = S / 2;
      fillPoly([[2 * k, 16 * k], [8 * k, 7 * k], [24 * k, 7 * k], [30 * k, 16 * k], [24 * k, 25 * k], [8 * k, 25 * k]], (x, y) => P.set(x, y, x + y < S ? 4 : 2, 1));
      const oct: [number, number][] = [], inner: [number, number][] = [];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.39; oct.push([c + Math.cos(a) * 8.4 * k, c + Math.sin(a) * 8.4 * k]); inner.push([c + Math.cos(a) * 6.4 * k, c + Math.sin(a) * 6.4 * k]); }
      fillPoly(oct, (x, y) => P.set(x, y, 1));
      fillPoly(inner, (x, y) => P.set(x, y, y < c ? n - 1 : n - 3));
      for (let y = Math.floor(9 * k); y < 23 * k; y++) P.set(c, y, 0, 2);
      P.glint(Math.floor(11 * k), Math.floor(10 * k), 3, true);
      return P;
    });
  }
  /** a floating lily pad seen from above: an irregular many-sided pad, a notch to the centre, vein strokes, a lit rim
   *  edge, a wet glint */
  pad(ramp: number[], var_ = 0): Rect {
    const S = q(24), c = S / 2;
    return this.get(`pad|${keyOf(ramp)}|${var_}`, S, S, (mk) => {
      const P = mk([ramp, GLINT]), n = ramp.length - 1, notch = 0.25 + var_ * 1.7, r = new Rand(this.seed ^ 0x9ad ^ var_);
      const pts: [number, number][] = [[c, c]], inner: [number, number][] = [[c, c]];
      for (let k = 0; k <= 12; k++) { const a = notch + 0.28 + (k / 12) * (Math.PI * 2 - 0.56), rr = c * 0.95 * r.range(0.92, 1.03); pts.push([c + Math.cos(a) * rr, c + Math.sin(a) * rr]); inner.push([c + Math.cos(a) * (rr - 2), c + Math.sin(a) * (rr - 2)]); }
      fillPoly(pts, (x, y) => P.set(x, y, x + y < S ? n - 1 : n - 2));
      fillPoly(inner, (x, y) => P.set(x, y, x + y < S - 2 ? n - 2 : n - 3));
      for (let k = 0; k < 7; k++) { const a = notch + 0.75 + k * 0.78; for (let t = 2; t < c * 0.82; t++) { const x = Math.floor(c + Math.cos(a) * t), y = Math.floor(c + Math.sin(a) * t); if (P.get(x, y) >= 0) P.nudge(x, y, k & 1 ? -1 : 1); } }
      P.glint(Math.floor(S * 0.3), Math.floor(S * 0.25), 1, true);
      P.sel(0, 1);
      return P;
    });
  }
  /** neutral skin for berries, beads and fruit (tinted per vertex): a lit cap, a shadowed base, a glint */
  speckle(): Rect {
    const S = q(8);
    return this.get('speckle', S, S, (mk) => {
      const P = mk([M('paper'), GLINT]);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) P.set(x, y, y < S * 0.35 ? 3 : y < S * 0.7 ? 2 : 1);
      P.set(2, 2, 4); P.set(3, 2, 4); P.set(2, 3, 4);
      P.glint(2, 1, 1);
      return P;
    });
  }
  /** faceted streaks for crystal shards (tinted per vertex): a lit face, a shadow face, a bright arris, a glint */
  crystal(): Rect {
    const W = q(8), H = q(16);
    return this.get('crystal', W, H, (mk) => {
      const P = mk([M('paper').slice(1), GLINT]);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) P.set(x, y, x === 4 || (x === 5 && y > H * 0.6) ? 4 : x < 4 ? 3 : x < 8 ? 2 : 1);
      P.glint(2, 3, 1, true);
      return P;
    });
  }
  /** a pitcher's skin wrapped round it: the leaf colour with veins of the accent running up, blotched toward the lip */
  pitcher(ramp: number[], accent: number[]): Rect {
    const W = q(24), H = q(40);
    return this.get(`pitcher|${keyOf(ramp)}|${keyOf(accent)}`, W, H, (mk) => {
      const P = mk([ramp, accent, GLINT]), n = ramp.length - 1, m = accent.length - 1, r = new Rand(this.seed ^ 0x9177);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const f = x % 9; P.set(x, y, f < 2 ? n - 3 : f < 3 ? n - 2 : f < 6 ? n - 1 : f === 6 ? n : n - 2); }
      for (let k = 0; k < 4; k++) {
        let x = k * 9 + 4;
        for (let y = 0; y < H; y++) { if (y % 7 === 6) x += r.pick([-1, 1]); P.set(x, y, m - 2, 1); if (y > H * 0.6) P.set(x + 1, y, m - 1, 1); if (y % 11 === 8 && y > 15) for (let j = 1; j < 4; j++) P.set(x + j, y - j, m - 3, 1); }
      }
      for (let k = 0; k < 11; k++) { const x = r.int(0, W - 3), y = r.int(Math.floor(H * 0.7), H - 3); P.set(x, y, m - 1, 1); P.set(x + 1, y, m - 2, 1); P.set(x, y + 1, m - 2, 1); P.set(x + 1, y + 1, m - 3, 1); }
      P.glint(7, Math.floor(H * 0.75), 2); P.glint(25, Math.floor(H * 0.38), 2);
      return P;
    });
  }
  /** a membrane sail between spines: veins fanning from the root and forking, panels in two planes, a pale free edge */
  membrane(ramp: number[]): Rect {
    const S = q(32);
    return this.get(`membrane|${keyOf(ramp)}`, S, S, (mk) => {
      const P = mk([ramp]), n = ramp.length - 1;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const t = y / S, qq = ((x / S) * 5 + t * 0.6) % 1, vein = Math.abs(qq - 0.5) < 0.04;
        P.set(x, y, vein ? n - 4 : t > 0.88 ? n : t > 0.82 ? n - 1 : qq < 0.5 ? n - 1 : n - 2);
      }
      for (let k = 0; k < 5; k++) for (let y = Math.floor(S * 0.38); y < S * 0.8; y++) P.set(Math.floor(((k + 0.5 - (y / S) * 0.6) / 5) * S + (y - S * 0.38) * 0.25), y, n - 3);
      return P;
    });
  }
  /** a snap trap's lobe, unrolled: the left half is the outer face (rim at the left edge, hinge at the centre), the
   *  right half the inner face (hinge at the centre, rim at the right edge). Outside: green planes with veins running
   *  to the rim; inside: the red digestive face set with glands, a green margin, wet glints. Opaque: the mesh is the
   *  silhouette. */
  trap(leafR: number[], accR: number[]): Rect {
    const W = 36, H = 28, hh = W / 2;
    return this.get(`trap|${keyOf(leafR)}|${keyOf(accR)}`, W, H, (mk) => {
      const P = mk([leafR, accR, GLINT]), n = leafR.length - 1, m = accR.length - 1;
      for (let y = 0; y < H; y++) for (let x = 0; x < hh; x++) {
        let i = x > hh - 4 ? n - 3 : x < 2 ? n - 1 : n - 2;
        if (x >= 4 && x <= 10 && y < H * 0.62) i = n - 1;
        if (x === 1 && y > 1 && y < H - 2) i = n;
        P.set(x, y, i);
      }
      for (let y0 = 2; y0 < H - 3; y0 += 5) for (let k = 0; k < 13; k++) { const x = hh - 2 - k, y = y0 + (k >> 1); if (y < H - 1) P.nudge(x, y, -1); }
      for (let y = 0; y < H; y++) for (let x = hh; x < W; x++) {
        const u = x - hh, i = u < 2 ? 1 : u < 13 ? (y < H * 0.55 ? m - 2 : m - 3) : -1;
        if (i >= 0) P.set(x, y, i, 1); else P.set(x, y, u < 15 ? n - 2 : u < 17 ? n - 1 : n, 0);
      }
      for (let row = 0, y = 2; y < H - 2; y += 3, row++) for (let x = hh + 3 + (row & 1) * 2; x < hh + 12; x += 4) { P.set(x, y, m, 1); P.set(x + 1, y, m - 1, 1); }
      P.glint(hh + 5, 6, 2); P.glint(hh + 8, 16, 2);
      for (let x = 0; x < W; x++) { const ac = x >= hh && x <= hh + 12 ? 1 : 0; P.set(x, 0, 0, ac); P.set(x, H - 1, 0, ac); }
      for (let y = 0; y < H; y++) { P.set(0, y, 0); P.set(W - 1, y, 0); }
      return P;
    });
  }
  /** a foliose lichen crust: a lobed rosette, older and darker at the heart, a pale growing margin on the lit side,
   *  a few fruiting cups; dark outline */
  lichen(ramp: number[], var_ = 0): Rect {
    const S = q(12), c = S / 2;
    return this.get(`lichen|${keyOf(ramp)}|${var_}`, S, S, (mk) => {
      const cup = M('rust'), P = mk([ramp, cup]), n = ramp.length - 1, r = new Rand(this.seed ^ 0x11c4e ^ (var_ * 97));
      const lob = [[1, 0.7, 0.95, 0.6, 1, 0.8, 0.55, 0.9, 0.75, 1, 0.65], [0.8, 1, 0.6, 0.9, 0.7, 1, 0.85, 0.5, 0.95, 0.7, 0.9], [0.95, 0.6, 0.8, 1, 0.55, 0.85, 1, 0.7, 0.6, 0.9, 1]][var_ % 3];
      const outer: [number, number][] = [], inner: [number, number][] = [];
      for (let k = 0; k < 11; k++) { const a = (k / 11) * Math.PI * 2 + var_, rr = c * 0.9 * (0.6 + 0.4 * lob[k]); outer.push([c + Math.cos(a) * rr, c + Math.sin(a) * rr]); inner.push([c + Math.cos(a) * rr * 0.45, c + Math.sin(a) * rr * 0.45]); }
      fillPoly(outer, (x, y) => P.set(x, y, x + y < S ? n - 1 : n - 2));
      fillPoly(inner, (x, y) => P.set(x, y, n - 3));
      for (let k = r.int(1, 3); k > 0; k--) { const x = Math.floor(r.range(c - 3, c + 2)), y = Math.floor(r.range(c - 3, c + 2)); P.set(x, y, 4, 1); P.set(x + 1, y, 2, 1); P.set(x, y + 1, 1, 1); }
      P.sel(0, 1);
      return P;
    });
  }

  /** a small flower head seen from above, built of overlapping drawn petals round a faceted eye (light, tinted per
   *  instance by its bloom colour) */
  floret(form: number): Rect {
    const S = q(16), c = S / 2;
    return this.get(`floret|${form}`, S, S, (mk) => {
      const P = mk([M('paper'), M('ochre')]), np = [7, 5, 5, 11][form % 4], r = new Rand(this.seed ^ (form * 77));
      for (let p = 0; p < np; p++) {
        const a = (p / np) * Math.PI * 2 + r.range(-0.15, 0.15), L = (form === 3 ? 0.56 : r.range(0.7, 0.9)) * c, w = (form === 3 ? 0.14 : r.range(0.2, 0.29)) * c * 2;
        leaflet(P, c + Math.cos(a) * 1.2, c + Math.sin(a) * 1.2, a, L, w, 'petal', { petal: true });
      }
      if (form !== 3) for (const [dx, dy, i] of [[-1, -1, 3], [0, -1, 3], [-1, 0, 3], [0, 0, 2], [1, 0, 2], [0, 1, 1], [1, 1, 1]] as [number, number, number][]) P.set(c + dx, c + dy, i, 1);
      return P;
    });
  }
}

// ------------------------------------------------------------------------------------------------ bark
/** bark slots (48 px each, tiling vertically, neutral grey: tinted per limb) */
export const BARK = { FURROW: 0, PLATE: 1, RING: 2, STEM: 3, FIBRE: 4, FLESH: 5, SMOOTH: 6, SCALE: 7 } as const;
export const BARK_SLOTS = 8;
const SW = 48, BH = 96;

/** pixel-art bark: plates and fissures drawn as deliberate marks, light from the left of each slot */
function paintBark(seed: number): THREE.DataTexture {
  const W = SW * BARK_SLOTS, d = new Uint8Array(W * BH * 4), r = new Rand(seed ^ 0xba4c);
  const T = [92, 128, 164, 196, 222];
  const put = (s: number, x: number, y: number, v: number, cr = 0, cg = 0, cb = 0) => {
    x = ((Math.floor(x) % SW) + SW) % SW; y = ((Math.floor(y) % BH) + BH) % BH;
    const i = (y * W + s * SW + x) * 4; d[i] = Math.max(0, Math.min(255, v + cr)); d[i + 1] = Math.max(0, Math.min(255, v + cg)); d[i + 2] = Math.max(0, Math.min(255, v + cb)); d[i + 3] = 255;
  };
  for (let s = 0; s < BARK_SLOTS; s++) for (let y = 0; y < BH; y++) for (let x = 0; x < SW; x++) {
    const band = x < 15 ? 3 : x < 33 ? 2 : 1;
    put(s, x, y, s === BARK.STEM || s === BARK.FLESH ? T[band + 1] - 10 : s === BARK.FIBRE || s === BARK.SMOOTH ? T[Math.min(4, band + 2)] : T[band]);
  }
  // furrowed bark: corky ridges split by dark fissures that wander and fork; each ridge lit on its left lip
  for (let k = 0; k < 7; k++) {
    let x = k * 6.9 + r.range(0, 2);
    for (let y = 0; y < BH; y++) {
      if (r.chance(0.22)) x += r.sign();
      put(BARK.FURROW, x, y, T[0] - 20, 10, 0, -8); put(BARK.FURROW, x + 1, y, T[3] + 10);
      if (y % 17 === 5) for (let j = 1; j < 4; j++) put(BARK.FURROW, x + 1 + j, y + j, T[0] - 4, 6);
    }
  }
  for (let k = 0; k < 12; k++) { const x = r.int(0, SW - 1), y = r.int(0, BH - 1); put(BARK.FURROW, x, y, T[4]); put(BARK.FURROW, x, y + 1, T[1]); }
  // plated bark: rows of different heights, each split into plates of different widths (wrapping round the trunk)
  {
    const rows: number[] = []; let acc = 0;
    while (acc < BH) { let h = r.int(9, 15); if (BH - (acc + h) < 9) h = BH - acc; rows.push(h); acc += h; }
    let y0 = 0;
    for (const h of rows) {
      const cuts: number[] = []; let x = r.int(0, 11);
      while (cuts.length === 0 || x < cuts[0] + SW - 7) { cuts.push(x); x += r.int(8, 16); }
      for (let k = 0; k < cuts.length; k++) {
        const a = cuts[k], b = k + 1 < cuts.length ? cuts[k + 1] : cuts[0] + SW, tone = r.pick([0, 6, -6, 10]), crack = r.chance(0.35) ? r.int(a + 3, b - 3) : -1;
        for (let yy = 0; yy < h; yy++) for (let xx = a; xx < b; xx++) {
          const px = xx - a, w = b - a, lit = (xx % SW) < 24;
          let v = (lit ? T[3] : T[2]) + tone;
          if (yy >= h - 1 || px >= w - 1) v = T[0] - 20;
          else if (yy === 0 || px === 0) v = (lit ? T[4] : T[3]) + 6;
          else if (px > w * 0.6) v -= 14;
          if (xx === crack && yy > 1 && yy < h - 3) v = T[0] - 8;
          put(BARK.PLATE, xx, y0 + yy, v, yy >= h - 1 || px >= w - 1 ? 8 : 0, 0, yy >= h - 1 || px >= w - 1 ? -6 : 0);
        }
      }
      y0 += h;
    }
  }
  // a palm trunk: leaf-scar rings with a diamond weave between them, fibres hanging from each ring
  for (let y = 0; y < BH; y++) for (let x = 0; x < SW; x++) {
    const ry = y % 24;
    if (ry === 0) put(BARK.RING, x, y, T[0] - 14, 10, 2, -8);
    else if (ry === 1) put(BARK.RING, x, y, T[4]);
    else if ((x + ry) % 12 === 0 || (x - ry + 96) % 12 === 0) put(BARK.RING, x, y, T[1]);
    else if (ry < 6 && (x * 7) % 11 === 0) put(BARK.RING, x, y, T[1] - 6);
  }
  // smooth pale bark: long horizontal lenticels, the odd dark eye where a twig fell
  for (let k = 0; k < 20; k++) { const x = r.int(0, SW - 6), y = r.int(0, BH - 1), l = r.int(2, 5); for (let j = 0; j < l; j++) put(BARK.SMOOTH, x + j, y, T[1]); }
  for (let k = 0; k < 3; k++) {
    const x = r.int(6, SW - 9), y = r.int(6, BH - 9);
    for (const [dx, dy, v] of [[0, 0, T[0] - 20], [1, 0, T[0] - 20], [0, 1, T[0]], [-1, 0, T[1]], [2, 1, T[1]], [0, -1, T[1]], [-1, 2, T[4]], [0, 2, T[4]]] as [number, number, number][]) put(BARK.SMOOTH, x + dx, y + dy, v);
  }
  // alien scales: overlapping rows of pointed shields (each row's tips lie over the row below), lit on the upper left
  for (let row = BH / 6 - 1; row >= 0; row--) for (let c = 0; c < SW / 12 + 1; c++) {
    const x0 = c * 12 + (row & 1) * 6 - 6, y0 = row * 6, tone = ((c * 7 + row * 3) % 4) * 5 - 6;
    for (let py = 0; py < 11; py++) for (let px = 0; px < 12; px++) {
      const half = py < 5 ? 6 : 10.5 - py;
      if (Math.abs(px + 0.5 - 6) > half) continue;
      const edgeB = py >= 5 && Math.abs(px + 0.5 - 6) > half - 1.2, rim = py === 0;
      const v = edgeB || py === 10 ? T[0] - 18 : rim ? T[4] + 8 : px < 5 ? T[3] + tone : px < 7 ? T[2] + 10 + tone : T[1] + tone;
      put(BARK.SCALE, x0 + px, y0 + py, v, edgeB ? 4 : 0, 0, edgeB ? 6 : 0);
    }
  }
  // stems: fine lengthwise lines; fibres: pale and dark streaks; flesh: pore clusters
  for (let y = 0; y < BH; y++) { put(BARK.STEM, 9, y, T[4]); put(BARK.STEM, 30, y, T[2] - 6); }
  for (let k = 0; k < 9; k++) { const x = r.int(0, SW - 1), dark = k & 1; for (let y = 0; y < BH; y++) if ((y + k * 13) % 19 < 12) put(BARK.FIBRE, x, y, dark ? T[1] : T[4]); }
  for (let k = 0; k < 22; k++) { const x = r.int(0, SW - 2), y = r.int(0, BH - 2); put(BARK.FLESH, x, y, T[1]); put(BARK.FLESH, x, y + 1, T[4]); }
  const t = new THREE.DataTexture(d, W, BH, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.NearestMipmapLinearFilter; t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
/** bark u range for a slot (kept off the slot edges so filtering never reaches the neighbour) */
export const barkU = (slot: number, u: number) => (slot * SW + 1 + u * (SW - 2)) / (SW * BARK_SLOTS);
