// Icons. Two sets share one name space:
//
//  * HI-RES VIGNETTES (the main set): small scenes of Unit 07 using each ability, painted by a resolution-
//    independent pixel-art painter. Shapes are authored on a 32-unit grid and rasterised at the size they are
//    shown at (always 1 source pixel = 1 screen pixel, so they are crisp at any UI scale): ramp shading lit from
//    the top left, ordered dithering, a 1 px dark outline around the silhouette, selective inner outlines where
//    one part overlaps another, a rim highlight and an optional drop shadow. An "fx" layer (glows, sparks,
//    shockwaves, motion lines) composites over the solids without being outlined (or under them, for halos).
//  * LEGACY 16 x 16 grids (ICONS / PAL, at the bottom): the older hand-pixelled set. Any name without a vignette
//    falls back to it (upscaled by an integer factor).
//
// API: hiIcon(name, px) -> PixelCanvas | null, iconURL(name, px), skillIcon(id) -> icon name, skillIconURL(id),
// hasHiIcon(name), HI_ICON_NAMES. ui/pixelart.ts icon(name) uses the vignettes at the HUD's current scale.
import { PixelCanvas, mixHex } from '../limbo/gfx/pixel';

type Ramp = readonly number[];
type Inside = (x: number, y: number) => boolean;
type Lum = (x: number, y: number) => number;

// ------------------------------------------------------------------ palette (ramps run dark -> light)
const RK: Ramp = [0x15131c, 0x24202d, 0x37313f, 0x4d4656, 0x675e6e, 0x857a88, 0xa89ca6];   // asteroid rock
const RW: Ramp = [0x19130f, 0x2b221d, 0x41352c, 0x5b4b3d, 0x786451, 0x987f66, 0xbaa086];   // warm boulder
const RD_ROCK: Ramp = [0x110f16, 0x1d1a24, 0x2c2834, 0x3e3846, 0x544c5c, 0x6c6276];        // dark ore rock
const BR: Ramp = [0x241807, 0x3f2a0d, 0x5c3f13, 0x7c581b, 0x9c7226, 0xbc8e36, 0xd8ab50, 0xeeca78, 0xfff0bc];
const GM: Ramp = [0x0e1114, 0x1a1e23, 0x272c32, 0x363c43, 0x474e56, 0x5c646c, 0x78818a, 0x9da6ad, 0xc9d0d4];
const OL: Ramp = [0x111410, 0x1d2217, 0x2a3121, 0x38412b, 0x485337, 0x5a6644, 0x707b54, 0x8a956a];
const CU: Ramp = [0x281009, 0x451f0e, 0x663016, 0x87441f, 0xa85a29, 0xc6793c, 0xe0a064, 0xf6ca98];
const RS: Ramp = [0x2a1409, 0x46220e, 0x663215, 0x86451b, 0xa65c25, 0xc27a3a];
const LN: Ramp = [0x0a2626, 0x14484a, 0x23706a, 0x3f9a8c, 0x7cc4b0, 0xcde8dc];                // lens / reactor teal
const VI: Ramp = [0x18142c, 0x2c2656, 0x463e88, 0x6660ac, 0x9c96c8, 0xdcd8ec];                // gravity field violet
const FI: Ramp = [0x3a1408, 0x76280e, 0xb84a18, 0xd9782c, 0xeab060, 0xf6e6c4];                // fire / sparks
const WA: Ramp = [0x061634, 0x0d2d62, 0x174f94, 0x2c7cc6, 0x56aee8, 0x9cdaff, 0xe6f8ff];      // water
const SO: Ramp = [0x170c05, 0x2a170b, 0x432812, 0x603c1d, 0x7e552b, 0x9c703e, 0xbc8f58];      // soil
const CB: Ramp = [0x050705, 0x0b100a, 0x141d11, 0x1f2d1a, 0x2e4424, 0x466432, 0x6c9448, 0xa8d07a]; // carbon (charred green-black)
const OR: Ramp = [0x1e100a, 0x3a1c0e, 0x5c2e14, 0x8a4a22, 0xb8662e, 0xe08a4a, 0xf4b47a, 0xffdcb4];      // ore nodules
const PL: Ramp = [0x0c2412, 0x16401c, 0x225e28, 0x347e34, 0x52a046, 0x82c462, 0xb8e48c];      // plant green
const VE: Ramp = [0x0e221f, 0x173c36, 0x235c50, 0x34806a, 0x52a486, 0x84c6a8, 0xc8e8d8];      // Veyr growth teal
const FL: Ramp = [0x220a0c, 0x3e1416, 0x5e2220, 0x80362e, 0xa24e3c, 0xc06e52, 0xdc9676];      // creature flesh
const BN: Ramp = [0x4e4636, 0x786c54, 0xa29676, 0xc8bc98, 0xe6dcbc, 0xfaf4e0];                // bone / cream
const GL: Ramp = [0x0a161a, 0x15303a, 0x234e58, 0x3a7680, 0x66a6ae, 0xa8dade, 0xe6fafa];      // glass
const RE: Ramp = [0x1c0605, 0x380b08, 0x5e130c, 0x881d12, 0xb02a18, 0xd64426, 0xee6c44, 0xffa684]; // signal red
const HZ: Ramp = [0x3a2c10, 0x684e1c, 0x94702a, 0xc49438, 0xd9a43a, 0xeedcae];                // hazard yellow
const BK: Ramp = [0x0c0b0a, 0x171513, 0x221f1c, 0x2f2b27, 0x3e3933, 0x524b43, 0x6a6258];      // Bakelite
const PH: Ramp = [0x020805, 0x071e0e, 0x124722, 0x288c42, 0x43b65a, 0x7ae088, 0xc0ffc6];      // P1 phosphor
const LB: Ramp = [0x06180e, 0x0c3018, 0x154a24, 0x226a34, 0x3a9048, 0x66b864];                // lab fluid
const BW: Ramp = [0x1a120c, 0x2c2016, 0x403020, 0x56442e, 0x6e5a40, 0x8a7656];                // dead wood
const CR: Ramp = [0x5e5744, 0x878068, 0xaea686, 0xd0c8a4, 0xece4c6, 0xfffaea];                // cream enamel
const NV: Ramp = [0x0a1430, 0x14245a, 0x203a86, 0x3456ae, 0x5478cc];                          // navy enamel
const OUT = 0x0b0a12;

// ------------------------------------------------------------------ painter
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x: number, y: number) => (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const L0 = Math.hypot(-0.48, -0.66, 0.58), LX = -0.48 / L0, LY = -0.66 / L0, LZ = 0.58 / L0;
const L2 = Math.hypot(LX, LY), LX2 = LX / L2, LY2 = LY / L2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const h1 = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const TAU = Math.PI * 2;

interface SOpt { part?: number; dither?: number; amb?: number; gain?: number; clip?: Inside }

class IP {
  readonly W: number; readonly k: number;
  readonly rid: Int16Array; readonly ri: Int8Array; readonly part: Int16Array;
  readonly fxo: Int32Array; readonly fxu: Int32Array; readonly halo: Int32Array;
  private ramps: Ramp[] = []; private rmap = new Map<Ramp, number>();
  pid = 0;
  /** a clip applied to every primitive while set */
  clip: Inside | null = null;
  /** fx primitives go under the solids (halos, beams behind things) while set */
  under = false;
  constructor(W: number) {
    this.W = W; this.k = (W - 4) / 32;
    const n = W * W;
    this.rid = new Int16Array(n).fill(-1); this.ri = new Int8Array(n); this.part = new Int16Array(n);
    this.fxo = new Int32Array(n).fill(-1); this.fxu = new Int32Array(n).fill(-1); this.halo = new Int32Array(n).fill(-1);
  }
  X(u: number) { return 2 + u * this.k; }
  U(p: number) { return (p + 0.5 - 2) / this.k; }
  private rampId(r: Ramp) { let i = this.rmap.get(r); if (i === undefined) { i = this.ramps.length; this.ramps.push(r); this.rmap.set(r, i); } return i; }
  /** rasterise a solid over a unit bounding box */
  solid(x0: number, y0: number, x1: number, y1: number, inside: Inside, ramp: Ramp, lum: Lum, o: SOpt = {}) {
    const part = o.part ?? ++this.pid, id = this.rampId(ramp), D = o.dither ?? 0.85, n = ramp.length, W = this.W;
    const amb = o.amb ?? 0, gain = o.gain ?? 1, clip = o.clip ?? this.clip;
    const px0 = Math.max(0, Math.floor(this.X(x0)) - 1), px1 = Math.min(W - 1, Math.ceil(this.X(x1)) + 1);
    const py0 = Math.max(0, Math.floor(this.X(y0)) - 1), py1 = Math.min(W - 1, Math.ceil(this.X(y1)) + 1);
    for (let py = py0; py <= py1; py++) for (let px = px0; px <= px1; px++) {
      const ux = this.U(px), uy = this.U(py);
      if (!inside(ux, uy) || (clip && !clip(ux, uy))) continue;
      const v = clamp(amb + lum(ux, uy) * gain, 0, 1);
      const i = py * W + px;
      this.rid[i] = id; this.ri[i] = clamp(Math.floor(v * (n - 1) + 0.5 + (bay(px, py) - 0.5) * D), 0, n - 1); this.part[i] = part;
    }
    return part;
  }
  // ---- shading helpers
  sph(cx: number, cy: number, rx: number, ry: number, rot = 0): Lum {
    const c = Math.cos(-rot), s = Math.sin(-rot);
    return (x, y) => {
      const dx = x - cx, dy = y - cy, lx = (dx * c - dy * s) / rx, ly = (dx * s + dy * c) / ry;
      const nz = Math.sqrt(Math.max(0, 1 - lx * lx - ly * ly));
      const nx = lx * Math.cos(rot) - ly * Math.sin(rot), ny = lx * Math.sin(rot) + ly * Math.cos(rot);
      return 0.1 + 0.95 * Math.max(0, nx * LX + ny * LY + nz * LZ);
    };
  }
  // ---- primitives
  ball(cx: number, cy: number, rx: number, ry: number, ramp: Ramp, o: SOpt & { rot?: number } = {}) {
    const rot = o.rot ?? 0, c = Math.cos(-rot), s = Math.sin(-rot), R = Math.max(rx, ry);
    const inside: Inside = (x, y) => { const dx = x - cx, dy = y - cy, lx = (dx * c - dy * s) / rx, ly = (dx * s + dy * c) / ry; return lx * lx + ly * ly <= 1; };
    const part = this.solid(cx - R, cy - R, cx + R, cy + R, inside, ramp, this.sph(cx, cy, rx, ry, rot), o);
    return { part, inside };
  }
  /** an irregular faceted stone */
  rock(cx: number, cy: number, r: number, seed: number, ramp: Ramp, o: SOpt & { sq?: number; n?: number; jag?: number; rot?: number } = {}) {
    const N = o.n ?? 8, sq = o.sq ?? 0.86, jag = o.jag ?? 0.24, rot = o.rot ?? h1(seed, 9) * TAU;
    const rad: number[] = []; for (let i = 0; i < N; i++) rad.push(1 - jag + h1(seed + i, 3) * jag);
    const radAt = (a: number) => { const t = (((a - rot) / TAU) % 1 + 1) % 1 * N, i = Math.floor(t), f = t - i; return rad[i % N] * (1 - f) + rad[(i + 1) % N] * f; };
    const inside: Inside = (x, y) => { const dx = (x - cx) / r, dy = (y - cy) / (r * sq); return Math.hypot(dx, dy) <= radAt(Math.atan2(dy, dx)); };
    const lum: Lum = (x, y) => {
      const dx = (x - cx) / r, dy = (y - cy) / (r * sq), a = Math.atan2(dy, dx), rr = Math.hypot(dx, dy) / radAt(a);
      const fi = Math.floor((((a - rot) / TAU) % 1 + 1) % 1 * N), am = rot + (fi + 0.5) / N * TAU;
      const q = Math.min(0.97, Math.round(rr * 3) / 3 * 0.92 + 0.05);
      const nz = Math.sqrt(1 - q * q);
      let v = 0.1 + 0.95 * Math.max(0, Math.cos(am) * q * LX + Math.sin(am) * q * LY + nz * LZ);
      // pits
      if (h1(Math.floor(x * 1.7) * 31 + Math.floor(y * 1.7), seed) < 0.07) v -= 0.18;
      return v;
    };
    const R = r * 1.05;
    const part = this.solid(cx - R, cy - R, cx + R, cy + R, inside, ramp, lum, o);
    return { part, inside };
  }
  poly(pts: number[], ramp: Ramp, lum: number | Lum, o: SOpt = {}) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
    const inside: Inside = (x, y) => {
      let c = false;
      for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
        const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const f: Lum = typeof lum === 'number' ? () => lum : lum;
    const part = this.solid(x0, y0, x1, y1, inside, ramp, f, o);
    return { part, inside };
  }
  /** a bevelled plate: lit top/left edge, shadowed bottom/right edge, a soft vertical falloff */
  box(x: number, y: number, w: number, h: number, ramp: Ramp, o: SOpt & { bevel?: number; lum?: number; r?: number } = {}) {
    const b = o.bevel ?? Math.min(1.1, Math.min(w, h) * 0.2), base = o.lum ?? 0.55, rr = o.r ?? 0;
    const inside: Inside = (px, py) => {
      if (px < x || py < y || px > x + w || py > y + h) return false;
      if (!rr) return true;
      const cx = clamp(px, x + rr, x + w - rr), cy = clamp(py, y + rr, y + h - rr);
      return (px - cx) ** 2 + (py - cy) ** 2 <= rr * rr;
    };
    const lum: Lum = (px, py) => {
      if (py - y < b || px - x < b * 0.7) return base + 0.35;
      if (y + h - py < b || x + w - px < b * 0.7) return base - 0.3;
      return base + 0.12 - ((py - y) / h) * 0.24;
    };
    const part = this.solid(x, y, x + w, y + h, inside, ramp, lum, o);
    return { part, inside };
  }
  /** a cylinder-shaded vertical capsule / tank (light falls across x) */
  tank(x: number, y: number, w: number, h: number, ramp: Ramp, o: SOpt & { r?: number } = {}) {
    const rr = o.r ?? w * 0.3;
    const inside: Inside = (px, py) => {
      if (px < x || py < y || px > x + w || py > y + h) return false;
      const cx = clamp(px, x + rr, x + w - rr), cy = clamp(py, y + rr, y + h - rr);
      return (px - cx) ** 2 + (py - cy) ** 2 <= rr * rr;
    };
    const lum: Lum = (px, py) => {
      const t = ((px - x) / w) * 2 - 1, nz = Math.sqrt(Math.max(0, 1 - t * t));
      const cap = py - y < rr ? (rr - (py - y)) / rr : 0;
      return 0.1 + 0.95 * Math.max(0, t * LX + -cap * LY * -1 * 0.6 + nz * LZ + cap * 0.25);
    };
    const part = this.solid(x, y, x + w, y + h, inside, ramp, lum, o);
    return { part, inside };
  }
  /** a thick segment shaded as a rod */
  seg(x0: number, y0: number, x1: number, y1: number, w: number, ramp: Ramp, o: SOpt = {}) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1e-6, ux = dx / L, uy = dy / L, nx = -uy, ny = ux, hw = w / 2;
    const side = nx * LX2 + ny * LY2;
    const inside: Inside = (x, y) => {
      const px = x - x0, py = y - y0, t = clamp((px * ux + py * uy) / L, 0, 1);
      return Math.hypot(px - dx * t, py - dy * t) <= hw;
    };
    const lum: Lum = (x, y) => {
      const px = x - x0, py = y - y0, off = clamp((px * nx + py * ny) / hw, -1, 1);
      const nz = Math.sqrt(Math.max(0, 1 - off * off));
      return 0.1 + 0.95 * Math.max(0, off * side * L2 + nz * LZ);
    };
    const part = this.solid(Math.min(x0, x1) - hw, Math.min(y0, y1) - hw, Math.max(x0, x1) + hw, Math.max(y0, y1) + hw, inside, ramp, lum, o);
    return { part, inside };
  }
  /** a raised ring (portholes, bezels, coils); ry squashes it into an ellipse */
  ring(cx: number, cy: number, r0: number, r1: number, ramp: Ramp, o: SOpt & { ry?: number } = {}) {
    const ry = o.ry ?? 1;
    const inside: Inside = (x, y) => { const d = Math.hypot(x - cx, (y - cy) / ry); return d >= r0 && d <= r1; };
    const lum: Lum = (x, y) => {
      const dx = x - cx, dy = (y - cy) / ry, d = Math.hypot(dx, dy) || 1e-6, u = (d - r0) / (r1 - r0);
      const dir = (dx / d) * LX2 + (dy / d) * LY2;
      return 0.5 + (u > 0.5 ? 0.42 : -0.42) * dir + (Math.abs(u - 0.5) < 0.2 ? 0.1 : 0);
    };
    const part = this.solid(cx - r1, cy - r1 * ry, cx + r1, cy + r1 * ry, inside, ramp, lum, o);
    return { part, inside };
  }
  disc(cx: number, cy: number, r: number, c: number, o: SOpt = {}) {
    const inside: Inside = (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    return { part: this.solid(cx - r, cy - r, cx + r, cy + r, inside, [c], () => 0, o), inside };
  }
  rivet(x: number, y: number, r = 0.55, ramp: Ramp = BR) { return this.ball(x, y, r, r, ramp); }
  // ---- fx layer (not outlined)
  private fset(px: number, py: number, c: number, halo = -1) {
    px = Math.floor(px); py = Math.floor(py);
    if (px < 0 || py < 0 || px >= this.W || py >= this.W) return;
    const i = py * this.W + px;
    if (this.clip && !this.clip(this.U(px), this.U(py))) return;
    (this.under ? this.fxu : this.fxo)[i] = c;
    if (halo >= 0) this.halo[i] = halo;
  }
  /** concentric quantised glow (ramp dark at the rim -> bright at the core) */
  glow(cx: number, cy: number, r: number, ramp: Ramp, o: { ry?: number; halo?: boolean; pow?: number } = {}) {
    const ry = o.ry ?? 1, n = ramp.length, W = this.W, pw = o.pow ?? 0.8;
    const px0 = Math.max(0, Math.floor(this.X(cx - r)) - 1), px1 = Math.min(W - 1, Math.ceil(this.X(cx + r)) + 1);
    const py0 = Math.max(0, Math.floor(this.X(cy - r * ry)) - 1), py1 = Math.min(W - 1, Math.ceil(this.X(cy + r * ry)) + 1);
    for (let py = py0; py <= py1; py++) for (let px = px0; px <= px1; px++) {
      const d = Math.hypot(this.U(px) - cx, (this.U(py) - cy) / ry) / r; if (d > 1) continue;
      const v = Math.pow(1 - d, pw);
      this.fset(px, py, ramp[clamp(Math.floor(v * n + (bay(px, py) - 0.5) * 0.9), 0, n - 1)], o.halo ? ramp[0] : -1);
    }
  }
  /** a line of width w units (at least one pixel) */
  fline(x0: number, y0: number, x1: number, y1: number, c: number, w = 0, halo = -1, dash = 0) {
    const a = [this.X(x0), this.X(y0)], b = [this.X(x1), this.X(y1)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L * 1.5)), hw = Math.max(0, (w * this.k) / 2 - 0.5);
    for (let i = 0; i <= n; i++) {
      if (dash && Math.floor((i / n) * L / dash) % 2) continue;
      const t = i / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      if (hw <= 0) this.fset(x, y, c, halo);
      else for (let oy = -Math.ceil(hw); oy <= Math.ceil(hw); oy++) for (let ox = -Math.ceil(hw); ox <= Math.ceil(hw); ox++) if (ox * ox + oy * oy <= hw * hw + 0.5) this.fset(x + ox, y + oy, c, halo);
    }
  }
  farc(cx: number, cy: number, r: number, a0: number, a1: number, c: number, w = 0, ry = 1, halo = -1, dash = 0) {
    const n = Math.max(6, Math.ceil(Math.abs(a1 - a0) * r * this.k * 1.2));
    let px = cx + Math.cos(a0) * r, py = cy + Math.sin(a0) * r * ry;
    for (let i = 1; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * ry;
      if (!dash || Math.floor(i / dash) % 2 === 0) this.fline(px, py, x, y, c, w, halo);
      px = x; py = y;
    }
  }
  fdot(cx: number, cy: number, r: number, c: number, halo = -1) {
    const R = Math.max(0.5 / this.k, r);
    for (let py = Math.floor(this.X(cy - R)); py <= Math.ceil(this.X(cy + R)); py++) for (let px = Math.floor(this.X(cx - R)); px <= Math.ceil(this.X(cx + R)); px++) {
      if (Math.hypot(this.U(px) - cx, this.U(py) - cy) <= R + 0.35 / this.k) this.fset(px, py, c, halo);
    }
  }
  /** a four-point star: a hot core, longer cardinal arms, short diagonals */
  spark(cx: number, cy: number, s: number, c: number, hot = 0xffffff, halo = -1) {
    this.fline(cx - s, cy, cx + s, cy, c, 0, halo); this.fline(cx, cy - s, cx, cy + s, c, 0, halo);
    const d = s * 0.42; this.fline(cx - d, cy - d, cx + d, cy + d, c, 0, halo); this.fline(cx - d, cy + d, cx + d, cy - d, c, 0, halo);
    this.fdot(cx, cy, Math.max(0.5, s * 0.22), hot, halo);
  }
  // ---- finish
  canvas(o: { dim?: boolean; shadow?: boolean } = {}): PixelCanvas {
    const W = this.W, n = W * W, rid = this.rid, ri = this.ri, part = this.part;
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < W && rid[y * W + x] >= 0;
    const ri2 = new Int8Array(ri);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (rid[i] < 0) continue;
      const len = this.ramps[rid[i]].length;
      let v = ri[i];
      // rim light on the top edge, and where an upper-left neighbour is open
      if (!solid(x, y - 1) || (!solid(x - 1, y) && !solid(x - 1, y - 1))) v = Math.min(len - 1, v + 1);
      // selective outline: darken where a part in front of this one begins
      const a = part[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (solid(X, Y) && part[Y * W + X] > a) { v = Math.max(0, Math.min(v, ri[i]) - 2); break; }
      }
      ri2[i] = v;
    }
    const col = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) if (rid[i] >= 0) col[i] = this.ramps[rid[i]][ri2[i]];
    // outer outline, hand-pixelled "sel-out": ink on the shadow side, and on the lit (top-left) edge a deep tone
    // of the shape it wraps, so silhouettes read soft and painted instead of stamped
    const out = new Uint8Array(n);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (rid[i] >= 0) continue;
      let hit = -1, lit = false;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        if (!solid(x + dx, y + dy)) continue;
        if (hit < 0) hit = (y + dy) * W + x + dx;
        if ((dx > 0 || dy > 0) && dx >= 0 && dy >= 0) lit = true;
      }
      if (hit < 0) continue;
      const R = this.ramps[rid[hit]];
      col[i] = lit && R.length > 2 ? mixHex(R[0], OUT, 0.35) : OUT; out[i] = 1;
    }
    // fx under the solids (shows only where nothing solid or outlined is)
    for (let i = 0; i < n; i++) if (col[i] < 0 && this.fxu[i] >= 0) col[i] = this.fxu[i];
    // fx over everything
    for (let i = 0; i < n; i++) if (this.fxo[i] >= 0) col[i] = this.fxo[i];
    // halos around fx
    const col2 = new Int32Array(col);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (col[i] >= 0) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= W) continue;
        const h = this.halo[Y * W + X]; if (h >= 0 && (this.fxo[Y * W + X] >= 0 || this.fxu[Y * W + X] >= 0)) { col2[i] = h; break; }
      }
    }
    const pc = new PixelCanvas(W, W); pc.wrap = false; pc.clear();
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      let c = col2[y * W + x]; if (c < 0) continue;
      if (o.dim) { const l = (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) | 0; c = mixHex((l << 16) | (l << 8) | l, 0x101018, 0.45); }
      pc.set(x, y, c);
    }
    if (o.shadow) {
      const a = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < W && col2[y * W + x] >= 0;
      for (let y = W - 1; y >= 1; y--) for (let x = W - 1; x >= 1; x--) if (!a(x, y) && a(x - 1, y - 1)) pc.set(x, y, 0x000000, 110);
    }
    void out;
    return pc;
  }
}

// ------------------------------------------------------------------ figures
interface Golem { x: number; y: number; s?: number; f?: 1 | -1; front?: [number, number] | null; back?: [number, number] | null; head?: boolean; body?: boolean; coil?: boolean; dim?: number; fist?: number; open?: boolean }
interface GolemOut { tipF: [number, number] | null; tipB: [number, number] | null; head: [number, number]; lens: [number, number] }
/** Unit 07, whole: back arm, gravity coil, boulder chest with a riveted plate and porthole, floating head, front arm.
 * Arm angles: [shoulder, elbow] in radians, 0 = hanging down, PI/2 = straight forward, PI = straight up. */
function golem(p: IP, g: Golem): GolemOut {
  const s = g.s ?? 1, f = g.f ?? 1, x = g.x, y = g.y, gain = g.dim ?? 1;
  const dir = (a: number): [number, number] => [Math.sin(a) * f, Math.cos(a)];
  const arm = (sx: number, sy: number, ang: [number, number], back: boolean): [number, number] => {
    const L1 = 3.3 * s, L2 = 3.1 * s, k = back ? 0.78 * gain : gain;
    const d1 = dir(ang[0]), ex = sx + d1[0] * L1, ey = sy + d1[1] * L1;
    const d2 = dir(ang[0] + ang[1]), wx = ex + d2[0] * L2, wy = ey + d2[1] * L2;
    p.seg(sx, sy, ex, ey, 0.75 * s, GM, { gain: k });
    p.seg(ex, ey, wx, wy, 0.7 * s, GM, { gain: k });
    p.rock(sx + d1[0] * L1 * 0.48, sy + d1[1] * L1 * 0.48, 1.4 * s, 31 + (back ? 7 : 0), RK, { gain: k, sq: 0.9 });
    p.ball(ex, ey, 0.78 * s, 0.78 * s, BR, { gain: k });
    p.rock(ex + d2[0] * L2 * 0.45, ey + d2[1] * L2 * 0.45, 1.3 * s, 41 + (back ? 7 : 0), RK, { gain: k, sq: 0.9 });
    const fr = 1.75 * s * (g.fist ?? 1);
    if (g.open && !back) {
      for (let i = -1; i <= 1; i++) { const a = ang[0] + ang[1] + i * 0.45, dd = dir(a); p.rock(wx + dd[0] * 1.6 * s, wy + dd[1] * 1.6 * s, 0.75 * s, 61 + i, RW, { gain: k }); }
      p.rock(wx + d2[0] * 0.3 * s, wy + d2[1] * 0.3 * s, 1.2 * s, 51, RW, { gain: k });
    } else p.rock(wx + d2[0] * 0.55 * s, wy + d2[1] * 0.55 * s, fr, 51 + (back ? 7 : 0), RW, { gain: k, sq: 0.92 });
    return [wx + d2[0] * (0.55 * s + fr), wy + d2[1] * (0.55 * s + fr)];
  };
  const shF: [number, number] = [x + 4.3 * s * f, y - 2.4 * s], shB: [number, number] = [x - 4.3 * s * f, y - 2.4 * s];
  let tipB: [number, number] | null = null, tipF: [number, number] | null = null;
  const body = g.body !== false;
  if (body && g.back) tipB = arm(shB[0], shB[1], g.back, true);
  if (body && g.coil !== false) {
    p.ball(x, y + 6.4 * s, 2.0 * s, 1.0 * s, VI, { gain: 1.1 });
    for (let i = 0; i < 3; i++) p.ring(x, y + 4.6 * s + i * 1.05 * s, (2.1 - i * 0.35) * s, (3.0 - i * 0.45) * s, CU, { ry: 0.38, gain });
  }
  if (body) {
    p.rock(x, y, 4.7 * s, 21, RK, { sq: 0.94, gain, jag: 0.16 });
    const px = x + 0.6 * s * f, py = y + 0.2 * s;
    p.box(px - 2.4 * s, py - 2.2 * s, 4.8 * s, 4.6 * s, OL, { gain, bevel: 0.45 * s });
    if (s > 0.7) for (const [rx, ry] of [[-1.85, -1.65], [1.85, -1.65], [-1.85, 1.85], [1.85, 1.85]]) p.rivet(px + rx * s, py + ry * s, 0.38 * s);
    p.ring(px, py + 0.1 * s, 0.75 * s, 1.4 * s, BR, { gain });
    p.glow(px, py + 0.1 * s, 0.85 * s, LN);
  }
  const hx = x + 0.5 * s * f, hy = body ? y - 7.4 * s : y;
  const lens = g.head !== false ? head(p, hx, hy, s, f) : [hx, hy] as [number, number];
  if (body && g.front) tipF = arm(shF[0], shF[1], g.front, false);
  return { tipF, tipB, head: [hx, hy], lens };
}
/** the survey head: a rock skull with a brass porthole lens, an olive jaw band, a little antenna */
function head(p: IP, x: number, y: number, s: number, f: number, o: { antenna?: boolean; glow?: Ramp } = {}): [number, number] {
  if (o.antenna !== false && s >= 1.2) {
    p.seg(x - 1.4 * s * f, y - 2.4 * s, x - 2.2 * s * f, y - 4.4 * s, 0.32 * s, GM);
    p.ball(x - 2.2 * s * f, y - 4.6 * s, 0.5 * s, 0.5 * s, RE);
  }
  const rk = p.rock(x, y, 3.4 * s, 11, RK, { sq: 0.9, jag: 0.18 });
  if (s >= 1.6) { // a glowing fissure and a few cracks across the skull
    p.clip = rk.inside;
    p.fline(x - 2.6 * s * f, y - 0.6 * s, x - 1.4 * s * f, y + 0.4 * s, LN[2]); p.fline(x - 1.4 * s * f, y + 0.4 * s, x - 1.8 * s * f, y + 1.4 * s, LN[2]);
    p.fline(x - 0.4 * s * f, y - 2.6 * s, x + 0.2 * s * f, y - 1.5 * s, RK[1]);
    p.clip = null;
  }
  p.poly([x - 2.9 * s, y + 1.3 * s, x + 2.9 * s, y + 1.3 * s, x + 2.4 * s, y + 2.7 * s, x - 2.4 * s, y + 2.7 * s], OL, (_, yy) => (yy < y + 1.7 * s ? 0.85 : 0.45));
  if (s >= 1.2) for (let i = -2; i <= 2; i++) p.rivet(x + i * 1.1 * s, y + 2.0 * s, 0.3 * s);
  const lx = x + 1.3 * s * f, ly = y - 0.4 * s;
  p.ring(lx, ly, 0.95 * s, 1.75 * s, BR);
  p.ball(lx, ly, 1.0 * s, 1.0 * s, GL, { gain: 0.5 });
  p.glow(lx, ly, 1.05 * s, o.glow ?? LN);
  if (s >= 1.2) p.fdot(lx - 0.45 * s, ly - 0.45 * s, 0.22 * s, 0xffffff);
  return [lx, ly];
}
/** a quadruped beast in profile */
function beast(p: IP, x: number, y: number, s: number, f: number, ramp: Ramp = FL, o: { eye?: Ramp; spines?: boolean; tuck?: number } = {}) {
  const k = o.tuck ?? 0;
  p.seg(x - 3.6 * s * f, y - 0.4 * s, x - 6.4 * s * f, y - 2.2 * s - k * 2 * s, 1.0 * s, ramp, { gain: 0.85 });
  p.seg(x - 2.4 * s * f, y + 0.8 * s, x - 2.9 * s * f - k * 2 * s * f, y + 4.0 * s - k * 2.5 * s, 1.15 * s, ramp, { gain: 0.7 });
  p.seg(x + 1.8 * s * f, y + 0.8 * s, x + 1.5 * s * f + k * 2 * s * f, y + 4.0 * s - k * 2.5 * s, 1.15 * s, ramp, { gain: 0.7 });
  p.ball(x, y, 4.3 * s, 2.5 * s, ramp);
  p.seg(x - 1.6 * s * f, y + 1.2 * s, x - 1.3 * s * f - k * 2 * s * f, y + 4.2 * s - k * 2.5 * s, 1.2 * s, ramp);
  p.seg(x + 2.8 * s * f, y + 1.0 * s, x + 3.0 * s * f + k * 2 * s * f, y + 4.2 * s - k * 2.5 * s, 1.2 * s, ramp);
  if (o.spines !== false) for (let i = -1; i <= 1; i++) { const sx = x + i * 1.6 * s * f; p.poly([sx - 0.7 * s, y - 2.0 * s, sx + 0.7 * s, y - 2.0 * s, sx - 0.3 * s * f, y - 3.6 * s], BN, 0.7); }
  p.ball(x + 4.6 * s * f, y - 1.3 * s, 2.2 * s, 1.75 * s, ramp);
  p.ball(x + 6.4 * s * f, y - 0.6 * s, 1.3 * s, 0.9 * s, ramp, { gain: 0.95 });
  for (let i = 0; i < 2; i++) p.poly([x + (5.8 + i * 0.8) * s * f, y + 0.1 * s, x + (6.3 + i * 0.8) * s * f, y + 0.1 * s, x + (6.05 + i * 0.8) * s * f, y + 0.9 * s], BN, 0.9);
  const ex = x + 5.0 * s * f, ey = y - 1.9 * s;
  if (o.eye) p.glow(ex, ey, 0.75 * s, o.eye); else p.disc(ex, ey, 0.42 * s, 0xffe070);
  return { eye: [ex, ey] as [number, number], top: [x + 4.4 * s * f, y - 3.1 * s] as [number, number] };
}
/** a leafy plant; veyr: grafted (teal veins, a glowing bud) */
function plant(p: IP, x: number, y: number, s: number, o: { veyr?: boolean } = {}) {
  const R = o.veyr ? VE : PL;
  p.seg(x, y, x - 0.4 * s, y - 13 * s, 1.3 * s, o.veyr ? VE : PL, { gain: 0.85 });
  const leaves: [number, number, number, number, number][] = [[-4.2, -7.5, 3.8, 1.6, -0.55], [4.0, -10.4, 3.8, 1.5, 0.6], [-3.6, -2.6, 3.3, 1.4, -0.3], [3.6, -4.6, 3.1, 1.3, 0.45]];
  for (const [dx, dy, rx, ry, rot] of leaves) {
    const lf = p.ball(x + dx * s, y + dy * s, rx * s, ry * s, R, { rot });
    if (o.veyr) { p.clip = lf.inside; p.fline(x + dx * s - Math.cos(rot) * rx * s, y + dy * s - Math.sin(rot) * rx * s, x + dx * s + Math.cos(rot) * rx * s * 0.8, y + dy * s + Math.sin(rot) * rx * s * 0.8, LN[4]); p.clip = null; }
  }
  if (o.veyr) { p.ball(x - 0.4 * s, y - 14 * s, 1.6 * s, 1.6 * s, VE, { gain: 1.2 }); p.glow(x - 0.4 * s, y - 14 * s, 1.1 * s, LN); }
}
/** a double helix between two points (two ramps; rungs in cream) */
function helix(p: IP, x0: number, x1: number, cy: number, amp: number, turns: number, ra: Ramp, rb: Ramp, w = 1.2) {
  const N = 40, P = (t: number, ph: number): [number, number] => [x0 + (x1 - x0) * t, cy + Math.sin(t * turns * TAU + ph) * amp];
  const strand = (ph: number, r: Ramp, front: boolean) => {
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N, z = Math.cos(((t0 + t1) / 2) * turns * TAU + ph);
      if ((z > 0) !== front) continue;
      const a = P(t0, ph), b = P(t1, ph); p.seg(a[0], a[1], b[0], b[1], w, r, { gain: front ? 1 : 0.65 });
    }
  };
  strand(0, ra, false); strand(Math.PI, rb, false);
  for (let i = 1; i < turns * 6; i++) { const t = i / (turns * 6), a = P(t, 0), b = P(t, Math.PI); p.seg(a[0], a[1], b[0], b[1], w * 0.55, BN, { gain: 0.8 }); }
  strand(0, ra, true); strand(Math.PI, rb, true);
}
/** motion streaks behind something moving along (dx, dy) */
function streaks(p: IP, x: number, y: number, dx: number, dy: number, len: number, n: number, spread: number, c = CR[4]) {
  const L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * spread, l = len * (0.6 + h1(i, 5) * 0.4);
    p.fline(x + nx * o - ux * 1.2, y + ny * o - uy * 1.2, x + nx * o - ux * (1.2 + l), y + ny * o - uy * (1.2 + l), c);
  }
}
function impact(p: IP, x: number, y: number, s: number) {
  p.glow(x, y, s * 1.1, FI, { pow: 0.6 });
  p.spark(x, y, s * 1.6, FI[4], 0xffffff);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3, r0 = s * 1.3, r1 = s * (2.0 + h1(i, 2) * 0.8); p.fline(x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1, FI[5]); }
}
function ground(p: IP, y: number, ramp: Ramp = SO, grass = false) {
  p.box(-1, y, 34, 34 - y, ramp, { bevel: 1.0, lum: 0.5 });
  if (grass) for (let x = 0; x < 32; x += 1.6) p.fline(x, y, x + 0.4, y - 0.8 - h1(x * 7, 1) * 1.2, PL[4]);
}
/** a five-point star */
function star(cx: number, cy: number, R: number, r: number, rot = -Math.PI / 2): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) { const a = rot + (i / 10) * TAU, rr = i % 2 ? r : R; pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  return pts;
}

// ------------------------------------------------------------------ the set
type Art = (p: IP) => void;
const ART: Record<string, Art> = {
  // ---------------- resources
  ore(p) {
    const big = p.rock(15, 16.5, 11.5, 3, RD_ROCK, { sq: 0.84, n: 9, jag: 0.2 });
    p.clip = big.inside;
    p.seg(5, 13, 13, 18, 1.6, RS); p.seg(13, 18, 21, 14, 1.4, RS); p.seg(15, 21, 24, 23, 1.2, RS); p.seg(9, 8, 14, 11, 1.0, RS);
    p.rock(19, 11.5, 2.9, 71, OR, { gain: 1.05 }); p.rock(10.5, 19.5, 2.4, 72, OR, { gain: 1.05 }); p.rock(21.5, 19.5, 2.0, 73, OR); p.rock(13.5, 9.5, 1.4, 74, OR);
    p.clip = null;
    p.rock(26.5, 26.5, 3.8, 8, RD_ROCK, { sq: 0.85 }); p.rock(27, 25.6, 1.5, 75, OR, { gain: 1.1 });
    p.spark(18.2, 10.4, 2.2, OR[7], 0xffffff); p.spark(9.8, 18.8, 1.4, OR[7], 0xffffff); p.fdot(26.4, 25, 0.4, 0xffffff);
  },
  carbon(p) {
    const crystal = (cx: number, by: number, w: number, h: number, lean: number, g = 1) => {
      const BL = [cx - w, by], BM = [cx + w * 0.15, by + w * 0.5], BRt = [cx + w, by - w * 0.25];
      const TL = [cx - w + lean, by - h], TM = [cx + w * 0.15 + lean, by - h + w * 0.5], TR = [cx + w + lean, by - h - w * 0.25], A = [cx + lean * 1.4 + w * 0.1, by - h - w * 2.1];
      p.poly([...BL, ...BM, ...TM, ...TL], CB, 0.3 * g);
      p.poly([...BM, ...BRt, ...TR, ...TM], CB, 0.6 * g);
      p.poly([...TL, ...TM, ...A], CB, 0.68 * g);
      p.poly([...TM, ...TR, ...A], CB, 0.98 * g);
    };
    p.rock(16, 27, 7, 4, CB, { sq: 0.45, gain: 0.8 });
    crystal(9, 26, 2.6, 7, -1.5, 0.85);
    crystal(21.5, 25.5, 2.4, 6, 1.8, 0.9);
    crystal(15, 26.5, 3.6, 13, 0.4);
    p.rock(6, 28.5, 2.2, 9, CB); p.rock(25.5, 28.6, 2.0, 12, CB);
    p.spark(16.7, 7.5, 2.0, CB[7], 0xffffff); p.fdot(23.5, 15.2, 0.45, CB[7]); p.glow(12, 28.6, 1.2, FI.slice(1, 4)); p.fdot(20, 28.8, 0.4, FI[3]);
  },
  water(p) {
    const inside: Inside = (x, y) => { if (Math.hypot(x - 16, y - 19.5) <= 8.6) return true; if (y < 19.5 && y > 2.5) { const t = (y - 2.5) / 17; return Math.abs(x - 16) <= 8.6 * Math.pow(t, 0.85); } return false; };
    const sp = p.sph(16, 17.5, 9, 12);
    p.solid(6, 2, 26, 29, inside, WA, (x, y) => sp(x, y) * 0.9 + (y > 22 ? 0.1 : 0));
    p.farc(16, 19.5, 6, Math.PI * 1.05, Math.PI * 1.45, WA[6], 0.9);
    p.fline(13.6, 10.5, 12.2, 13.5, WA[6], 0.8);
    p.fdot(19.5, 23, 0.7, WA[5]);
    p.under = true; p.farc(16, 29.5, 11, 0, TAU, WA[4], 0, 0.22); p.farc(16, 29.5, 14.5, 0, TAU, WA[3], 0, 0.22, -1, 2); p.under = false;
  },
  soil(p) {
    const inside: Inside = (x, y) => y <= 28.8 && Math.hypot((x - 16) / 13.6, (y - 28) / 10.5) <= 1;
    const sp = p.sph(16, 27, 13.6, 10.5);
    p.solid(2, 17, 30, 29, inside, SO, (x, y) => sp(x, y) - (h1(Math.floor(x * 1.3) * 17 + Math.floor(y * 1.3), 4) < 0.16 ? 0.25 : 0));
    p.ball(11.5, 21, 2.2, 1.6, SO, { gain: 0.9 }); p.ball(21, 24.5, 2.5, 1.7, SO, { gain: 0.85 }); p.ball(16.5, 25.5, 1.4, 1.0, SO);
    p.rock(7.5, 25.5, 1.6, 2, RK); p.rock(24.5, 21, 1.3, 5, RK); p.rock(14, 27.6, 1.0, 9, RK);
    p.seg(17, 18, 17.6, 11, 0.8, PL);
    p.ball(15, 11.6, 2.4, 1.0, PL, { rot: -0.5 }); p.ball(20.2, 10.8, 2.4, 1.0, PL, { rot: 0.45 });
  },
  // ---------------- status
  hull(p) {
    const sh = [5, 4, 27, 4, 27, 15, 24.5, 22, 16, 29, 7.5, 22, 5, 15];
    const outer = p.poly(sh, GM, (x, y) => 0.62 - y / 70 + (Math.abs(x + y * 0.5 - 22) < 1.4 ? 0.3 : 0));
    p.poly([8, 7, 24, 7, 24, 14.5, 22, 20, 16, 25.5, 10, 20, 8, 14.5], OL, (x, y) => 0.6 - y / 60 - x / 120);
    p.poly(star(16, 14.5, 5.2, 2.1), CR, 0.75);
    for (const [x, y] of [[7, 6], [16, 6], [25, 6], [6.8, 14.5], [25.2, 14.5], [10.5, 22.5], [21.5, 22.5]]) p.rivet(x, y, 0.65, GM);
    p.clip = outer.inside; p.fline(23, 4.5, 21, 8, OUT); p.fline(21, 8, 22.5, 10.5, OUT); p.clip = null;
  },
  cell(p) {
    p.box(14, 1.5, 4, 2.6, BR, { bevel: 0.6 });
    p.box(9.5, 3.8, 13, 3.6, BR, { bevel: 0.8 });
    const g = p.tank(10.5, 6.8, 11, 18.4, GL, { r: 3, gain: 0.85 });
    p.clip = g.inside; p.glow(16, 16, 4.3, LN, { ry: 1.9 }); p.fline(16, 9.5, 16, 22.5, LN[5]); p.fline(13, 9, 13, 21, GL[6], 0, -1, 2.5); p.clip = null;
    p.box(9.5, 24.4, 13, 3.6, BR, { bevel: 0.8 });
    p.seg(13, 28, 13, 30.5, 1.1, GM); p.seg(19, 28, 19, 30.5, 1.1, GM);
    p.spark(23.5, 6.5, 2, LN[4], 0xffffff);
  },
  charge(p) {
    p.under = true; p.glow(16, 16, 13, VI.slice(0, 3), { pow: 1.3 }); p.under = false;
    p.poly([19.5, 1.5, 8.5, 17, 15, 17, 11, 30.5, 24.5, 12.5, 17.5, 12.5, 22.5, 1.5], VI, (x, y) => 0.9 - y / 60 + (x < 14 ? 0.1 : 0));
    p.spark(25.5, 23, 2, VI[4], 0xffffff); p.spark(6.5, 8, 1.6, VI[4], 0xffffff);
  },
  skills(p) {
    const tr = (a: number[], b: number[]) => p.seg(a[0], a[1], b[0], b[1], 1.3, CU);
    const R = [16, 27.5], A = [16, 19], B = [8, 13], C = [24, 13], D = [8, 5.5], E = [24, 5.5], F = [16, 9];
    tr(R, A); tr(A, B); tr(A, C); tr(B, D); tr(C, E); tr(A, F);
    const node = (c: number[], r: number, g: Ramp | null) => { p.ring(c[0], c[1], r * 0.55, r, BR); if (g) p.glow(c[0], c[1], r * 0.6, g); else p.disc(c[0], c[1], r * 0.55, GM[2]); };
    node(R, 3.4, LN); node(A, 2.4, LN); node(B, 2.4, LN); node(C, 2.4, FI.slice(1)); node(F, 2.1, null); node(D, 2.1, null); node(E, 2.1, LN);
  },
  menu(p) {
    const inside: Inside = (x, y) => { const dx = x - 16, dy = y - 16, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx); return r <= 10.4 + (Math.cos(a * 8) > 0.25 ? 3.2 : 0) && r >= 3.6; };
    p.solid(1, 1, 31, 31, inside, BR, (x, y) => { const dx = x - 16, dy = y - 16, r = Math.hypot(dx, dy) || 1; return 0.55 + 0.4 * ((dx / r) * LX2 + (dy / r) * LY2) * (r > 7.5 ? 1 : -1); });
    p.ring(16, 16, 3.6, 6.4, OL);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; p.rivet(16 + Math.cos(a) * 8.6, 16 + Math.sin(a) * 8.6, 0.6, GM); }
  },
  // ---------------- chassis
  head(p) {
    p.under = true; p.glow(15.5, 29, 8, VI.slice(0, 4), { ry: 0.32 }); p.under = false;
    head(p, 15, 15, 2.95, 1);
    p.rock(4.5, 25.5, 1.1, 3, RK); p.rock(27, 23, 1.3, 6, RK); p.rock(25.5, 28.5, 0.8, 8, RK);
    p.fline(4.5, 27.5, 4.5, 29.5, VI[3]); p.fline(27, 25.4, 27, 27.6, VI[3]);
  },
  torso(p) {
    p.ball(4.2, 12, 2.4, 2.4, GM); p.ball(27.8, 12, 2.4, 2.4, GM);
    p.box(12.5, 2.5, 7, 3.2, GM, { bevel: 0.7 });
    p.ring(16, 27.5, 3.2, 5.6, CU, { ry: 0.38 });
    p.rock(16, 16.5, 12.4, 21, RK, { sq: 0.86, jag: 0.14 });
    p.box(8.5, 9.5, 15, 13.5, OL, { bevel: 1.1 });
    for (const [x, y] of [[10, 11], [22, 11], [10, 21.5], [22, 21.5], [16, 10.6]]) p.rivet(x, y, 0.7);
    p.ring(16, 16.5, 2.8, 4.7, BR);
    p.glow(16, 16.5, 2.95, LN); p.fdot(14.8, 15.2, 0.5, 0xffffff);
  },
  armR(p) {
    p.ball(6, 6.5, 3.2, 3.2, GM);
    p.seg(5, 8.5, 14, 16.5, 1.3, GM); p.seg(7.5, 5.5, 16, 13.5, 1.0, GM);
    p.farc(9.5, 13.5, 5, -1.9, -0.4, CU[5], 0.8);
    p.rock(10.3, 10.8, 3.5, 31, RK, { sq: 0.85 });
    p.ball(15.8, 15.6, 2.0, 2.0, BR);
    p.seg(15.5, 15.5, 22.5, 22.5, 1.2, GM);
    p.rock(19.3, 19.5, 3.2, 41, RK, { sq: 0.86 });
    const fist = p.rock(24.8, 25.2, 4.8, 51, RW, { sq: 0.88 });
    p.clip = fist.inside; p.fline(22, 23, 25.5, 28.5, RW[1]); p.fline(24.5, 21.5, 28, 26.5, RW[1]); p.clip = null;
  },
  armL(p) {
    const m = (x: number) => 32 - x;
    p.ball(m(6), 6.5, 3.2, 3.2, GM);
    p.seg(m(5), 8.5, m(14), 16.5, 1.3, GM); p.seg(m(7.5), 5.5, m(16), 13.5, 1.0, GM);
    p.rock(m(10.3), 10.8, 3.5, 37, RK, { sq: 0.85 });
    p.ball(m(15.8), 15.6, 2.0, 2.0, BR);
    p.seg(m(15.5), 15.5, m(21.5), 21.5, 1.2, GM);
    p.rock(m(19.3), 19.5, 3.2, 47, RK, { sq: 0.86 });
    p.rock(m(23), 23.5, 3.0, 57, RW);
    for (const [dx, dy, r] of [[3.4, 0.2, 1.3], [2.6, 2.6, 1.3], [0.2, 3.4, 1.25]]) p.rock(m(23 + dx), 23.5 + dy, r, 70 + dx, RW);
    p.glow(m(26.5), 27.2, 1.4, LN); p.fdot(m(26.5), 27.2, 0.35, 0xffffff);
  },
  coil(p) {
    p.ball(16, 15.5, 4.2, 9.5, VI, { gain: 1.15 });
    for (let i = 0; i < 4; i++) p.ring(16, 7.8 + i * 4.6, 6.6 - i * 0.5, 9.2 - i * 0.6, CU, { ry: 0.36 });
    p.under = true; p.farc(16, 16, 14.5, 0, TAU, VI[3], 0, 0.42, -1, 3); p.under = false;
    p.rock(3.2, 19.5, 1.7, 3, RK); p.rock(28.6, 13.2, 1.5, 7, RK); p.rock(25.8, 23.5, 1.1, 9, RK);
    p.glow(16, 31, 4.5, VI.slice(1), { ry: 0.35 });
  },
  plating1(p) {
    const pl = p.box(5, 5, 22, 22, GM, { bevel: 1.4, lum: 0.6, r: 1.5 });
    p.clip = pl.inside; for (let i = 0; i < 3; i++) p.fline(9 + i * 2, 25, 21 + i * 2, 7, GM[7]); p.clip = null;
    for (const [x, y] of [[8, 8], [16, 7.6], [24, 8], [7.6, 16], [24.4, 16], [8, 24], [16, 24.4], [24, 24]]) p.rivet(x, y, 0.8, GM);
    p.box(14.6, 11, 2.8, 10, CR, { bevel: 0.4, lum: 0.75 });
  },
  plating2(p) {
    p.box(9, 2.5, 20, 19, GM, { bevel: 1.2, lum: 0.42, r: 1.2 });
    for (const [x, y] of [[11.5, 5], [26.5, 5], [26.5, 18.5]]) p.rivet(x, y, 0.75, GM);
    const pl = p.box(3, 9, 22, 20, GM, { bevel: 1.4, lum: 0.62, r: 1.2 });
    p.clip = pl.inside;
    p.box(3, 23.5, 22, 5.5, HZ, { bevel: 0.6, lum: 0.6 });
    for (let x = -2; x < 26; x += 4) p.poly([x, 29, x + 2, 29, x + 5, 23.5, x + 3, 23.5], BK, 0.5);
    p.clip = null;
    for (const [x, y] of [[6, 12], [22, 12], [6, 21], [22, 21]]) p.rivet(x, y, 0.8, GM);
    p.box(10.8, 12.5, 2.4, 8.5, CR, { bevel: 0.4, lum: 0.75 }); p.box(14.8, 12.5, 2.4, 8.5, CR, { bevel: 0.4, lum: 0.75 });
  },
  reactor(p) {
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + 0.13, r0 = 11.5, r1 = i % 2 ? 14 : 15.5; p.fline(16 + Math.cos(a) * r0, 16 + Math.sin(a) * r0, 16 + Math.cos(a) * r1, 16 + Math.sin(a) * r1, i % 2 ? LN[3] : LN[4]); }
    p.ring(16, 16, 6.6, 10.6, BR);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.39; p.rivet(16 + Math.cos(a) * 8.6, 16 + Math.sin(a) * 8.6, 0.65, GM); }
    p.glow(16, 16, 6.8, LN, { pow: 0.55 }); p.fdot(16, 16, 1.6, 0xffffff); p.spark(16, 16, 4.5, LN[5], 0xffffff);
  },
  // ---------------- harvest
  drill(p) {
    p.rock(25, 28, 7.5, 5, RD_ROCK, { sq: 0.7 });
    p.rock(27, 26, 1.7, 76, OR); p.rock(21.5, 28, 1.2, 77, OR);
    const lens = head(p, 8, 8.5, 1.75, 1);
    void lens;
    p.seg(11, 12, 15.5, 16.5, 1.5, GM);
    p.poly([13, 15.5, 17, 11.5, 20, 14.5, 16, 18.5], OL, 0.6);
    const bit = p.poly([15.6, 17.7, 19.4, 13.9, 27, 26.5], GM, (x, y) => 0.75 - ((x - 15) + (y - 14)) / 40);
    p.clip = bit.inside; for (let i = 0; i < 5; i++) { const t = 0.2 + i * 0.16, x = 17.5 + (27 - 17.5) * t, y = 15.8 + (26.5 - 15.8) * t; p.fline(x - 2.4 * (1 - t), y + 0.6, x + 0.6, y - 2.4 * (1 - t), GM[1]); } p.clip = null;
    p.spark(25.5, 24, 2.6, FI[4], 0xffffff);
    for (const [x, y] of [[21, 20], [23, 19.5], [29, 20], [27.5, 18], [20, 22.5]]) p.fdot(x, y, 0.5, h1(x, y) < 0.5 ? FI[4] : FI[3], FI[1]);
    p.fline(24, 23, 21.5, 19, FI[3]); p.fline(26, 23, 28.5, 18.5, FI[3]);
  },
  intake(p) {
    p.seg(7, 31, 7.6, 17, 3.2, BW); p.seg(7.4, 21, 3, 16, 1.2, BW); p.seg(7.6, 19, 11.8, 14.5, 1.1, BW); p.seg(7.5, 17.5, 6.5, 12.5, 1.0, BW);
    p.ball(6.5, 30.5, 5.5, 1.4, SO, { gain: 0.7 });
    head(p, 24, 9.5, 1.85, -1);
    const curve = (t: number): [number, number] => { const a = [9, 16], b = [13, 2], c = [21, 13]; const u = 1 - t; return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]; };
    for (let i = 0; i < 9; i++) { const t = i / 8, [x, y] = curve(t); p.fdot(x + (h1(i, 3) - 0.5) * 1.6, y + (h1(i, 4) - 0.5) * 1.6, 0.35 + t * 0.55, i % 3 ? CB[3] : CB[5], CB[7]); }
    p.fdot(5, 13, 0.5, CB[3], CB[7]); p.fdot(11.5, 11, 0.6, CB[4], CB[7]);
  },
  siphon(p) {
    p.ball(16, 27.5, 13, 3.6, WA, { gain: 0.9 });
    p.farc(16, 27.5, 9, 0, TAU, WA[5], 0, 0.3); p.farc(16, 27.5, 5, 0, TAU, WA[6], 0, 0.3, -1, 2);
    for (let i = 0; i < 26; i++) { const t = i / 25, y = 26 - t * 13, x = 16 + Math.sin(t * 11) * 3.6 * (1 - t * 0.5), r = 0.55 + (1 - t) * 0.25; p.fdot(x, y, r, Math.cos(t * 11) > 0 ? WA[5] : WA[3], WA[1]); }
    head(p, 16, 8.2, 1.9, 1);
    p.fdot(9, 19, 0.5, WA[4], WA[1]); p.fdot(23.5, 17, 0.55, WA[5], WA[1]);
  },
  excavate(p) {
    ground(p, 23, SO, true);
    p.ball(13, 24.5, 6.5, 2.4, SO, { gain: 0.25 });
    golem(p, { x: 26, y: 12, s: 0.95, f: -1, front: [1.0, 0.9], back: [0.4, 0.2] });
    p.ball(10.5, 15.3, 2.8, 1.8, SO, { gain: 1.05 });
    for (const [x, y, r] of [[6, 11, 0.9], [9, 8.5, 0.8], [4, 16, 0.7], [13.5, 10, 0.6]]) p.rock(x, y, r, x * 3, SO);
    p.fline(5.5, 13, 7, 14.5, SO[4]); p.fline(9.5, 10.5, 10, 12.5, SO[4]);
  },
  magnet(p) {
    p.under = true; for (const r of [8.5, 12, 15.5]) p.farc(9, 16, r, -0.9, 0.9, VI[r > 12 ? 2 : 3], 0, 1, -1, 2); p.under = false;
    head(p, 8.5, 16, 1.9, 1);
    for (const [x, y, r, sd] of [[21, 9.5, 1.8, 3], [25.5, 17, 2.1, 5], [21.5, 24.5, 1.6, 7], [29, 11, 1.2, 9]] as [number, number, number, number][]) {
      p.rock(x, y, r, sd, RD_ROCK); p.rock(x + 0.3, y - 0.3, r * 0.55, sd + 50, OR, { gain: 1.1 });
      streaks(p, x, y, -1, (16 - y) * 0.05, 4, 2, r * 0.7, VI[4]);
    }
  },
  tanks(p) {
    p.seg(9.5, 4, 9.5, 1.5, 1.4, CU); p.seg(9.5, 1.8, 22.5, 1.8, 1.4, CU); p.seg(22.5, 1.5, 22.5, 7, 1.4, CU);
    const a = p.tank(3.5, 4, 12, 24, GM, { r: 3.5 });
    const b = p.tank(17, 7, 12, 21, OL, { r: 3.5 });
    for (const [x, y, w] of [[3.5, 9, 12], [3.5, 22, 12]]) p.box(x, y, w, 1.4, GM, { lum: 0.4, bevel: 0.4, clip: a.inside });
    for (const [x, y, w] of [[17, 11.5, 12], [17, 23, 12]]) p.box(x, y, w, 1.4, OL, { lum: 0.3, bevel: 0.4, clip: b.inside });
    p.box(7.5, 12, 4, 8.5, BK, { bevel: 0.4, lum: 0.2 }); p.box(8.1, 15.5, 2.8, 4.6, WA, { bevel: 0.3, lum: 0.75 });
    p.box(21, 14, 4, 7.5, BK, { bevel: 0.4, lum: 0.2 }); p.box(21.6, 17, 2.8, 3.6, SO, { bevel: 0.3, lum: 0.7 });
    p.ring(28, 25.5, 1.4, 2.6, BR); p.disc(28, 25.5, 1.4, CR[4]); p.fline(28, 25.5, 29, 24.4, RE[4]);
  },
  // ---------------- gravity
  lift(p) {
    const g = golem(p, { x: 8.5, y: 20.5, s: 0.85, front: [2.65, 0.25], back: [0.35, -0.2] });
    const t = g.tipF!;
    p.under = true; p.glow(22, 15.5, 7, VI.slice(0, 4), { ry: 0.3 }); p.under = false;
    for (let i = 0; i < 6; i++) { const u = i / 5, x = t[0] + (21 - t[0]) * u, y = t[1] + (14.5 - t[1]) * u - Math.sin(u * Math.PI) * 3; p.fdot(x, y, 0.55 - u * 0.15, i % 2 ? VI[4] : VI[3], VI[1]); }
    p.rock(22, 8.5, 6, 13, RW, { sq: 0.85 });
    p.farc(22, 15.8, 5.5, 0, TAU, VI[4], 0, 0.28);
    p.rock(15.5, 4.5, 1.1, 4, RW); p.rock(29, 5, 0.9, 6, RW); p.fdot(19, 18.5, 0.4, RW[3]); p.fdot(25, 19.5, 0.4, RW[3]);
  },
  slam(p) {
    ground(p, 24, RK);
    p.ball(18, 24.6, 7.5, 1.8, RK, { gain: 0.3 });
    p.clip = (x, y) => y > 24.2;
    for (const [x1, y1] of [[8, 31], [12, 29], [25, 31], [29, 28], [18, 32]]) p.fline(18, 25, x1, y1, RK[0]);
    p.clip = null;
    for (let i = 0; i < 4; i++) { const y = 2 + i * 5.2, w = 6.5 - i * 0.4, c = i === 3 ? VI[5] : VI[3 + (i % 2)]; p.fline(18 - w, y, 18, y + 3.6, c, 1.1, VI[1]); p.fline(18 + w, y, 18, y + 3.6, c, 1.1, VI[1]); }
    p.glow(18, 23.5, 8, VI.slice(1), { ry: 0.32 });
    for (const [x, y, r] of [[6, 17, 1.5], [29, 18.5, 1.3], [10, 13.5, 0.9], [26, 14, 1.0]]) p.rock(x, y, r, x, RK);
    p.fline(7.5, 19, 9.5, 21.5, RK[5]); p.fline(27.5, 20, 25.5, 22, RK[5]);
  },
  repulse(p) {
    p.under = true; p.farc(16, 18, 12, 0, TAU, VI[3], 1.0, 0.85); p.farc(16, 18, 15.5, 0, TAU, VI[2], 0, 0.85, -1, 2); p.under = false;
    golem(p, { x: 16, y: 18.5, s: 0.82, front: [1.95, 0.35], back: [1.95, 0.35] });
    p.farc(16, 18, 8.4, Math.PI * 1.1, Math.PI * 1.9, VI[5], 0, 1);
    for (const [x, y, dx, dy] of [[3.5, 4, -1, -1], [28.5, 4.5, 1, -1], [3, 29, -1, 1], [29, 28.5, 1, 1]] as [number, number, number, number][]) { p.rock(x, y, 1.6, x + y, RK); streaks(p, x, y, dx, dy, 3.5, 2, 1.2, VI[4]); }
  },
  well(p) {
    for (let arm = 0; arm < 3; arm++) for (let i = 0; i < 40; i++) {
      const t = i / 40, r = 3.6 + t * 12.5, a = arm * (TAU / 3) + t * 5.2;
      p.fdot(16 + Math.cos(a) * r, 16 + Math.sin(a) * r * 0.9, 0.45 + t * 0.2, t < 0.35 ? VI[5] : t < 0.7 ? VI[3] : VI[2]);
    }
    p.ball(16, 16, 4.6, 4.2, VI, { gain: 0.4 });
    p.ring(16, 16, 3.4, 4.8, VI, { gain: 1.2 });
    p.disc(16, 16, 2.4, 0x07040f);
    for (const [r, a, s] of [[9.5, 0.9, 1.4], [12.5, 2.9, 1.7], [7, 4.3, 1.0], [13.5, 5.4, 1.2]]) p.rock(16 + Math.cos(a) * r, 16 + Math.sin(a) * r * 0.9, s, r * 3, RK);
  },
  shape(p) {
    ground(p, 24, SO, true);
    const pil = p.poly([9, 10, 23, 8.5, 24.5, 25, 7.5, 25], RW, (x, y) => 0.62 - x / 70 + (x < 11 ? 0.15 : 0) - y / 90);
    p.clip = pil.inside; for (const y of [13, 17.5, 21.5]) p.fline(6, y, 26, y - 1, RW[1]); p.fline(14, 9, 13, 13, RW[1]); p.fline(19, 17, 20, 21, RW[1]); p.clip = null;
    p.poly([8.6, 10.4, 23.2, 8.8, 23.6, 11, 8.2, 12], PL, 0.7);
    for (const [x, y, r] of [[6, 25, 1.8], [26, 25.5, 2.0], [4, 27.5, 1.2], [28.5, 28, 1.3]]) p.ball(x, y, r, r * 0.8, SO, { gain: 1.2 });
    for (const [x, y] of [[4, 14], [28, 13]]) for (let i = 0; i < 2; i++) { const yy = y + i * 4; p.fline(x - 2.2, yy + 2, x, yy, LN[4], 0.8, LN[1]); p.fline(x + 2.2, yy + 2, x, yy, LN[4], 0.8, LN[1]); }
  },
  storm(p) {
    ground(p, 27, RK);
    p.farc(16, 27.5, 5.5, 0, TAU, RE[5], 0, 0.3); p.fline(16, 26, 16, 29, RE[6]); p.fline(10.5, 27.5, 21.5, 27.5, RE[5], 0, -1, 1.5);
    const stones: [number, number][] = [];
    for (let i = 0; i < 7; i++) { const a = Math.PI + (i / 6) * Math.PI, x = 16 + Math.cos(a) * 12.5, y = 9 + Math.sin(a) * 5.2; stones.push([x, y]); }
    p.under = true; for (const [x, y] of stones) p.glow(x, y + 1.6, 2, VI.slice(1, 4), { ry: 0.4 }); p.under = false;
    for (const [x, y] of stones) p.fline(x, y + 1.8, x + (16 - x) * 0.55, y + 1.8 + (26 - y) * 0.55, VI[3], 0, -1, 1.5);
    stones.forEach(([x, y], i) => p.rock(x, y, 1.7 + h1(i, 2) * 0.7, i * 5 + 1, RW));
    p.spark(16, 25.5, 2.4, FI[4], 0xffffff);
  },
  // ---------------- combat
  punch(p) {
    const g = golem(p, { x: 8.2, y: 20, s: 1.08, front: [Math.PI / 2, 0], back: [0.55, -0.55], fist: 1.15 });
    const t = g.tipF!;
    streaks(p, t[0] - 2.5, t[1], 1, 0, 6, 3, 1.6);
    impact(p, t[0] + 2.2, t[1], 2.4);
    p.rock(28.5, 14, 1.2, 4, RK); p.rock(29, 20.5, 1.0, 6, RK); p.fdot(27, 11.5, 0.45, RK[4]);
  },
  rock(p) {
    const g = golem(p, { x: 9.5, y: 21, s: 0.92, front: [2.15, 0.25], back: [0.5, -0.4] });
    const t = g.tipF!;
    for (let i = 1; i < 6; i++) { const u = i / 6, x = t[0] + (24 - t[0]) * u, y = t[1] + (7 - t[1]) * u - Math.sin(u * Math.PI) * 2.5; p.fdot(x, y, 0.4, CR[3]); }
    p.rock(25, 6.5, 3.2, 17, RW);
    streaks(p, 25, 6.5, 1, -0.55, 4, 3, 1.5);
  },
  boulder(p) {
    golem(p, { x: 16, y: 22.5, s: 0.85, front: [2.85, 0.3], back: [2.85, 0.3] });
    p.rock(16, 7.5, 7.6, 23, RW, { sq: 0.82 });
    p.fline(6, 15, 4.5, 14, CR[4]); p.fline(26, 15, 27.5, 14, CR[4]); p.fline(5.5, 18, 3.5, 18, CR[4]); p.fline(26.5, 18, 28.5, 18, CR[4]);
  },
  shrapnel(p) {
    p.fline(2, 3, 11, 13, CR[3], 0, -1, 1.5);
    p.under = true; p.farc(16, 18, 10, 0, TAU, FI[2], 0, 0.75, -1, 2); p.under = false;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.5, r = 8.5 + h1(i, 3) * 3, x = 16 + Math.cos(a) * r, y = 18 + Math.sin(a) * r * 0.8;
      p.poly([x - Math.cos(a + 1.3) * 1.6, y - Math.sin(a + 1.3) * 1.6, x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, x - Math.cos(a - 1.3) * 1.4, y - Math.sin(a - 1.3) * 1.4], RW, 0.6 + Math.cos(a + 2.2) * 0.3);
      streaks(p, x, y, Math.cos(a), Math.sin(a), 2.5, 1, 0, FI[4]);
    }
    impact(p, 16, 18, 3);
  },
  frenzy(p) {
    golem(p, { x: 7.6, y: 20.5, s: 0.95, front: [Math.PI / 2, 0], back: [0.6, -0.5] });
    for (const [x, y, k] of [[21.5, 10, 0.75], [24, 17.5, 1], [21, 25, 0.75]] as [number, number, number][]) {
      streaks(p, x - 1.6, y, 1, (y - 17.5) * 0.06, 5.5, 2, 1.4);
      p.rock(x, y, 2.2, x + y, RW, { gain: k });
      p.spark(x + 4, y, 1.8, FI[4], 0xffffff);
    }
  },
  plow(p) {
    for (let i = 0; i < 4; i++) p.ball(3 + i * 2.6, 27 - i * 0.3, 2.4 - i * 0.3, 1.6, CR, { gain: 0.65 });
    streaks(p, 9, 18, 1, 0, 8, 3, 2.2, VI[4]);
    golem(p, { x: 12, y: 18.5, s: 0.82, front: [1.75, -0.1], back: [1.2, 0.2], fist: 1.1 });
    beast(p, 25, 8.5, 0.62, -1, FL, { tuck: 0.6 });
    impact(p, 20.5, 14, 1.8);
  },
  // ---------------- fabrication
  graft(p) {
    p.ball(19.5, 29, 7.5, 2.4, SO);
    p.under = true; p.farc(19.5, 29, 11, 0, TAU, VE[4], 0, 0.24, -1, 2); p.under = false;
    plant(p, 19.5, 28.5, 1.05, { veyr: true });
    p.rock(5, 18.5, 2.8, 51, RW);
    p.seg(7.5, 18.2, 17.8, 18.8, 0.7, BR);
    p.glow(18.4, 18.8, 1.8, LN);
  },
  sow(p) {
    p.seg(16, 0, 16, 4, 1.8, GM);
    p.box(4.5, 3.5, 23, 4.5, BR, { bevel: 0.8 });
    for (const x of [7, 25]) { p.seg(x, 7, x, 19, 1.1, GM); }
    p.ball(16, 13, 3.3, 2.4, SO, { gain: 1.0 });
    p.clip = (x, y) => Math.hypot((x - 16) / 3.3, (y - 13) / 2.4) <= 1; p.fline(13.5, 13, 18.5, 13, VE[5]); p.clip = null;
    p.box(4.5, 17, 23, 3.6, OL, { bevel: 0.7 });
    for (const x of [6.5, 25.5]) { p.rivet(x, 5.8, 0.6, GM); p.rivet(x, 18.8, 0.6, GM); }
    ground(p, 27, SO);
    for (const x of [8, 16, 24]) { p.seg(x, 27.5, x + 0.3, 23.5, 0.75, VE); p.ball(x - 1.3, 23.8, 1.5, 0.7, VE, { rot: -0.5 }); p.ball(x + 1.6, 23.2, 1.5, 0.7, VE, { rot: 0.5 }); }
    for (const x of [11, 21]) p.fline(x, 9.5, x, 16, LN[4], 0, -1, 1);
  },
  convert(p) {
    p.seg(9, 13, 4, 5.5, 1.6, BN);
    p.ball(14.5, 18.5, 10, 8, FL);
    p.ball(24.5, 21.5, 5.6, 3.6, FL, { gain: 0.95 });
    p.poly([19, 24.5, 29.5, 23, 28, 27, 20, 28.5], FL, 0.35);
    for (let i = 0; i < 4; i++) p.poly([20.5 + i * 2.2, 24.4, 22 + i * 2.2, 24.4, 21.2 + i * 2.2, 26], BN, 0.85);
    const skull = (x: number, y: number) => Math.hypot((x - 14.5) / 10, (y - 18.5) / 8) <= 1;
    p.clip = skull; p.fline(7, 15, 12, 15, LN[4], 0, LN[1]); p.fline(12, 15, 14, 12, LN[4], 0, LN[1]); p.fline(9, 20, 13, 20, LN[3], 0, LN[1]); p.fline(13, 20, 15.5, 16.5, LN[3], 0, LN[1]); p.clip = null;
    p.fdot(12, 15, 0.6, LN[5]); p.fdot(13, 20, 0.6, LN[5]);
    p.seg(14, 6.5, 15.5, 12.5, 1.5, GM); p.box(12.2, 4, 4.4, 3, BR, { bevel: 0.6 });
    p.glow(20.5, 15.5, 2.2, LN); p.fdot(20.5, 15.5, 0.6, 0xffffff);
    p.spark(18, 9.5, 1.6, LN[4], 0xffffff);
  },
  print(p) {
    p.seg(4, 4, 4, 29.5, 1.6, GM); p.seg(28, 4, 28, 29.5, 1.6, GM);
    p.box(2.5, 2.5, 27, 3.2, GM, { bevel: 0.6 });
    p.box(13.5, 5.5, 5, 3.6, BR, { bevel: 0.6 });
    p.poly([14.5, 9, 17.5, 9, 16, 12], GM, 0.6);
    ground(p, 28.5, GM);
    p.clip = (_, y) => y > 19.5; beast(p, 16, 23.5, 0.95, 1, FL); p.clip = null;
    p.clip = (_, y) => y <= 19.5; beast(p, 16, 23.5, 0.95, 1, VE, { eye: LN }); p.clip = null;
    p.fline(3, 19.5, 29, 19.5, LN[5]); p.fline(16, 12, 16, 19, LN[4], 0, LN[1], 1.2);
    p.clip = (_, y) => y <= 19.5; for (let y = 13; y < 19.5; y += 2) p.fline(5, y, 27, y, VE[2], 0, -1, 0); p.clip = null;
  },
  grove(p) {
    p.ball(16, 31.5, 17, 5.5, SO);
    const tree = (x: number, y0: number, y1: number, w: number, cr: number) => {
      p.seg(x, y0, x, y1, w, BW);
      const c = p.ball(x, y1 - cr * 0.55, cr, cr * 0.82, VE);
      p.clip = c.inside; p.fline(x - cr * 0.6, y1 - cr * 0.2, x + cr * 0.2, y1 - cr * 1.1, LN[4]); p.fline(x + cr * 0.6, y1 - cr * 0.3, x, y1 - cr * 0.9, LN[4]); p.clip = null;
    };
    tree(6.5, 28.5, 21, 1.4, 3.6); tree(25.5, 28.5, 20, 1.6, 4.2); tree(16, 28.5, 15, 2.4, 6.5);
    for (const [x, y] of [[9.5, 6], [24, 7.5], [5, 12], [28.5, 13], [20, 3]]) p.fdot(x, y, 0.55, LN[4], LN[1]);
    p.farc(16, 6, 9, Math.PI * 1.05, Math.PI * 1.95, LN[3], 0, 0.5, -1, 2);
  },
  // ---------------- lab
  lab(p) {
    p.seg(23, 3, 29, 3, 1.4, CU); p.seg(29, 3, 29, 26, 1.4, CU);
    p.box(5.5, 2, 21, 4.2, BR, { bevel: 0.8 });
    const g = p.tank(7.5, 5.5, 17, 21, GL, { r: 1.5, gain: 0.7 });
    p.box(8.5, 9, 15, 17, LB, { bevel: 0.5, lum: 0.6, clip: g.inside });
    p.clip = (x, y) => x > 8.5 && x < 23.5 && y > 9; beast(p, 15.5, 17, 0.6, 1, LB.map((c) => mixHex(c, 0x000000, 0.35)), { eye: LN, spines: false }); p.clip = null;
    p.clip = g.inside; p.fline(10, 7, 10, 24, GL[6], 0, -1, 2.2); p.clip = null;
    for (const [x, y, r] of [[19, 12, 0.8], [21, 16, 0.6], [12, 21, 0.7], [20.5, 22, 0.5]]) p.farc(x, y, r, 0, TAU, PH[6]);
    p.box(5.5, 25.5, 21, 4.5, BR, { bevel: 0.8 });
    p.rivet(8, 27.8, 0.6, GM); p.rivet(24, 27.8, 0.6, GM);
  },
  splice(p) {
    helix(p, 2, 16, 16, 5.5, 1.1, LN, FI);
    helix(p, 16, 30, 16, 5.5, 1.1, VE, HZ);
    p.glow(16, 16, 3, LN, { pow: 0.6 }); p.spark(16, 16, 4, LN[5], 0xffffff);
  },
  sequencer(p) {
    p.box(2.5, 3, 27, 21, BK, { bevel: 1.2, lum: 0.5, r: 1.2 });
    const scr = p.box(5.5, 6, 21, 14, PH, { bevel: 0.3, lum: 0.1, r: 1.5 });
    p.clip = scr.inside;
    for (let i = 0; i < 26; i++) { const t = i / 25, x = 7 + t * 18, y = 11 + Math.sin(t * TAU * 1.5) * 3; p.fdot(x, y, 0.35, PH[5]); p.fdot(x, 22 - y, 0.35, PH[4]); if (i % 4 === 0) p.fline(x, y, x, 22 - y, PH[3]); }
    for (let i = 0; i < 5; i++) p.box(7 + i * 3.8, 17, 2.6, 1.6, i < 3 ? PH : BK, { lum: i < 3 ? 0.9 : 0.4, bevel: 0.2 });
    p.clip = null;
    p.ball(7, 27, 1.8, 1.8, BR); p.ball(12.5, 27, 1.8, 1.8, BR);
    const tape = p.box(17, 25.5, 13.5, 4, CR, { bevel: 0.4, lum: 0.7 });
    p.clip = tape.inside; for (let x = 18.5; x < 30; x += 2) if (h1(x, 2) > 0.35) p.fdot(x, 27.5, 0.55, BK[0]); p.clip = null;
  },
  vat(p) {
    p.seg(16, 6, 16, 1.5, 1.8, GM); p.ring(16, 2, 1.2, 2.6, RE, { ry: 0.5 });
    const v = p.ball(16, 17.5, 12.5, 11, CU);
    p.clip = v.inside; for (const y of [10, 25]) for (let x = 5; x < 28; x += 3) p.fdot(x, y + Math.abs(x - 16) * -0.04, 0.45, CU[7]); p.clip = null;
    p.ring(16, 17.5, 4, 6.4, BR);
    p.disc(16, 17.5, 4.1, LB[2]);
    p.ball(16.3, 17.8, 3, 2.6, BN);
    p.ball(17, 18, 1.4, 2.0, [0x060606, 0x101010, 0x202020]);
    p.glow(17, 18, 1.1, FI.slice(2)); p.fdot(15.6, 16.6, 0.5, 0xffffff);
    for (const [x, y, r] of [[25, 6, 2.2], [28.5, 3.5, 1.6], [6, 5, 1.6]]) p.ball(x, y, r, r * 0.85, CR, { gain: 0.95 });
  },
  // ---------------- story and misc
  planet(p) {
    p.under = true; p.farc(16, 16, 14.5, Math.PI, TAU, CR[3], 1.2, 0.3); p.under = false;
    const land: Inside = (x, y) => { const n = Math.sin(x * 0.55 + Math.cos(y * 0.4) * 2) + Math.cos(y * 0.6 - x * 0.2) + Math.sin((x + y) * 0.9) * 0.35; return n > 0.45; };
    const disk: Inside = (x, y) => Math.hypot(x - 16, y - 16) <= 11.5;
    const sp = p.sph(16, 16, 11.5, 11.5);
    const pt = ++p.pid;
    p.solid(4, 4, 28, 28, (x, y) => disk(x, y) && !land(x, y), WA, sp, { part: pt });
    p.solid(4, 4, 28, 28, (x, y) => disk(x, y) && land(x, y), VE, sp, { part: pt });
    p.solid(4, 4, 28, 28, (x, y) => disk(x, y) && Math.abs(y - 16) > 10, CR, sp, { part: pt });
    p.farc(16, 16, 14.5, 0, Math.PI, CR[4], 1.2, 0.3);
    p.spark(27, 5, 1.6, CR[5], 0xffffff);
  },
  dna(p) {
    const N = 36, P = (t: number, ph: number): [number, number] => [16 + Math.sin(t * TAU * 1.25 + ph) * 6.5, 2.5 + t * 27];
    const strand = (ph: number, r: Ramp, front: boolean) => { for (let i = 0; i < N; i++) { const t0 = i / N, t1 = (i + 1) / N, z = Math.cos(((t0 + t1) / 2) * TAU * 1.25 + ph); if ((z > 0) !== front) continue; const a = P(t0, ph), b = P(t1, ph); p.seg(a[0], a[1], b[0], b[1], 2.0, r, { gain: front ? 1 : 0.6 }); } };
    strand(0, LN, false); strand(Math.PI, HZ, false);
    for (let i = 1; i < 9; i++) { const t = i / 9, a = P(t, 0), b = P(t, Math.PI); p.seg(a[0], a[1], b[0], b[1], 1.0, BN, { gain: 0.8 }); }
    strand(0, LN, true); strand(Math.PI, HZ, true);
  },
  heart(p) {
    const inside: Inside = (x, y) => { const X = (x - 16) / 12.5, Y = -(y - 15) / 12.5; const a = X * X + Y * Y - 0.36; return a * a * a - X * X * Y * Y * Y * 0.9 <= 0; };
    p.solid(2, 3, 30, 29, inside, RE, p.sph(16, 15, 13, 13));
    p.ball(11, 10.5, 2.2, 1.5, RE, { gain: 1.4, rot: -0.6 }); p.fdot(10.2, 10, 0.6, 0xffffff);
  },
  skull(p) {
    p.ball(16, 13, 10.5, 9.5, BN);
    p.box(9.5, 18.5, 13, 8.5, BN, { r: 2.5, lum: 0.5 });
    p.ball(11.8, 14.5, 2.9, 2.6, [0x0a0808, 0x1a1414]); p.ball(20.2, 14.5, 2.9, 2.6, [0x0a0808, 0x1a1414]);
    p.poly([16, 17.5, 14.4, 21, 17.6, 21], [0x0a0808, 0x1a1414], 0.5);
    for (let x = 11.5; x <= 20.5; x += 2.2) p.fline(x, 23, x, 26.5, BN[0]);
    p.fline(16, 4, 17.5, 7.5, BN[0]); p.fline(17.5, 7.5, 16.5, 9.5, BN[0]);
    p.glow(11.8, 14.5, 1.0, LN); p.glow(20.2, 14.5, 1.0, LN);
  },
  pause(p) { p.box(8.5, 6, 5.5, 20, BR, { bevel: 1, r: 1 }); p.box(18, 6, 5.5, 20, BR, { bevel: 1, r: 1 }); },
  stop(p) {
    const pts: number[] = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; pts.push(16 + Math.cos(a) * 13, 16 + Math.sin(a) * 13); }
    p.poly(pts, RE, (x, y) => 0.75 - (x + y) / 90);
    p.box(8.5, 13.5, 15, 5, CR, { bevel: 0.6, lum: 0.75 });
  },
  move(p) {
    p.poly([16, 3, 28, 15.5, 20.5, 15.5, 20.5, 28.5, 11.5, 28.5, 11.5, 15.5, 4, 15.5], VE, (x, y) => 0.85 - y / 50 - x / 120);
    p.spark(25, 5, 1.4, LN[4], 0xffffff);
  },
  attack(p) {
    p.seg(3, 30, 10, 22, 2.2, GM); p.ball(10.5, 21.5, 2.0, 2.0, BR);
    const f = p.rock(17, 15.5, 9, 51, RW, { sq: 0.88 });
    p.clip = f.inside; for (let i = 0; i < 3; i++) p.fline(13 + i * 3.5, 9, 10.5 + i * 3.5, 15, RW[1]); p.clip = null;
    p.spark(27.5, 5, 2.5, FI[4], 0xffffff); p.fline(25, 9, 28, 11, FI[4]); p.fline(23, 6, 24, 2.5, FI[4]);
  },
  absorb(p) {
    head(p, 25, 8, 1.55, -1);
    p.clip = (x, y) => x + (h1(Math.floor(y * 2), 3) - 0.5) * 2 < 13.5;
    beast(p, 10.5, 22.5, 0.82, 1, FL);
    p.clip = null;
    for (let i = 0; i < 14; i++) { const t = i / 13, x = 13 + t * 9 + Math.sin(t * 7) * 1.4, y = 21 - t * 11 - Math.sin(t * Math.PI) * 2.5; p.fdot(x, y, 0.35 + (1 - t) * 0.35, i % 3 ? LN[4] : FL[5], LN[1]); }
    p.fline(10, 15, 9, 13, LN[3]);
  },
  territory(p) {
    p.ball(16, 30, 15, 5, VE);
    p.under = true; p.farc(15, 28.5, 13, 0, TAU, LN[4], 0, 0.28, -1, 2); p.under = false;
    p.seg(13, 29, 13, 3.5, 1.1, GM); p.ball(13, 3.2, 0.9, 0.9, BR);
    const fl = p.poly([13.5, 4, 28, 8.5, 13.5, 13.5], CR, (x) => 0.85 - (x - 13) / 40);
    p.clip = fl.inside; p.poly([13.5, 4, 21, 6.4, 21, 11.2, 13.5, 13.5], NV, 0.55); for (const y of [7.8, 10.2]) p.fline(21, y, 28, 8.5 + (y - 8.5) * 0.3, RE[5]); p.clip = null;
    p.poly(star(17, 8.6, 2.0, 0.85), CR, 0.9);
  },
  ally(p) {
    p.farc(23, 8.5, 3.5, 0, TAU, LN[4], 0.8, 0.35, LN[1]);
    beast(p, 14, 18.5, 1.05, 1, FL, { eye: LN });
    p.seg(19, 10.5, 20.5, 14, 1.1, GM); p.box(17.6, 8.4, 3, 2.4, BR, { bevel: 0.5 });
    for (const [x, y] of [[6, 7], [27, 16], [4, 14]]) p.fdot(x, y, 0.5, LN[4], LN[1]);
  },
  journal(p) {
    p.poly([2.5, 9, 16, 6.5, 29.5, 9, 29.5, 27, 16, 25, 2.5, 27], [0x2a140c, 0x44241a, 0x5e3424, 0x7a4a32], 0.55);
    p.poly([4, 8.5, 15.5, 6.5, 15.5, 24, 4, 25.5], CR, (x) => 0.65 + x / 80);
    p.poly([16.5, 6.5, 28, 8.5, 28, 25.5, 16.5, 24], CR, (x) => 0.85 - (x - 16) / 60);
    for (let i = 0; i < 6; i++) { p.fline(5.5, 10.5 + i * 2.4, 14, 9.5 + i * 2.4, CR[1]); }
    for (let i = 0; i < 3; i++) p.fline(18, 18 + i * 2.3, 26.5, 19.2 + i * 2.3, CR[1]);
    p.ring(22, 12.4, 1.6, 2.7, BR); p.fdot(22, 12.4, 0.9, LN[3]); p.fline(18.5, 10, 20, 11, CR[1]);
    p.seg(27, 3, 19.5, 17, 1.4, HZ); p.poly([19.0, 16.4, 20.4, 17.2, 18.6, 19.4], BN, 0.6);
  },
  radio(p) {
    for (const r of [4, 7, 10]) p.farc(20, 8, r, -1.2, 0.2, CR[4 - Math.floor(r / 4)], 0, 1, -1, r > 6 ? 2 : 0);
    p.seg(10, 9, 10, 1.5, 1.0, GM); p.ball(10, 1.6, 0.8, 0.8, RE);
    p.box(4.5, 8.5, 14, 21, OL, { bevel: 1.1, r: 1.5 });
    const g = p.box(6.5, 11, 10, 7, BK, { bevel: 0.3, lum: 0.25 });
    p.clip = g.inside; for (let y = 12; y < 18; y += 1.4) p.fline(6.5, y, 16.5, y, BK[4]); p.clip = null;
    p.box(6.5, 20, 10, 3.6, PH, { bevel: 0.3, lum: 0.3 }); p.fline(7.5, 21.8, 15.5, 21.8, PH[5], 0, -1, 1.2);
    p.ball(8.5, 26.3, 1.4, 1.4, BR); p.ball(14.5, 26.3, 1.4, 1.4, BK, { gain: 1.4 });
  },
  // ---------------- skills added to the tree
  plating3(p) {
    const pl = p.box(4, 4, 25, 25, GM, { bevel: 1.6, lum: 0.42, r: 1.6 });
    p.clip = pl.inside;
    p.box(4, 4, 4, 25, HZ, { bevel: 0.4, lum: 0.6 }); p.box(4, 25, 25, 4, HZ, { bevel: 0.4, lum: 0.6 });
    for (let k = -30; k < 34; k += 4) { p.poly([4, k, 8, k - 4, 8, k - 2, 4, k + 2], BK, 0.4); p.poly([k, 29, k + 2, 29, k + 6, 25, k + 4, 25], BK, 0.4); }
    p.box(10.5, 6.5, 16, 16, GM, { bevel: 1.2, lum: 0.58, r: 1 });
    p.clip = null;
    for (const [x, y] of [[12.5, 8.5], [24.5, 8.5], [12.5, 20.5], [24.5, 20.5]]) p.rivet(x, y, 0.85, GM);
    for (const x of [14.6, 17.6, 20.6]) p.box(x, 11, 2, 7.5, CR, { bevel: 0.3, lum: 0.75 });
    p.ball(24.5, 13.5, 1.4, 1.1, GM, { gain: 0.35 });
    impact(p, 25, 13, 1.6); p.rock(29.5, 4.5, 1.3, 9, RK); streaks(p, 29.5, 4.5, 1, -1.2, 3, 2, 1.1);
  },
  colossus(p) {
    ground(p, 28.5, RK);
    p.clip = (_, y) => y > 28.6; for (const [x1, y1] of [[6, 33], [11, 31], [24, 32], [29, 30]]) p.fline(17, 29, x1, y1, RK[0]); p.clip = null;
    golem(p, { x: 18.5, y: 17.5, s: 1.28, front: [0.45, -0.25], back: [0.5, -0.3], fist: 1.1 });
    // a man for scale
    p.seg(4.6, 28.5, 4.6, 26, 0.9, BK); p.seg(5.8, 28.5, 5.8, 26, 0.9, BK);
    p.box(3.9, 22.4, 2.6, 4.2, CR, { lum: 0.7, bevel: 0.3 });
    p.ball(5.2, 21, 1.15, 1.15, [0x6a3e22, 0x9a6440, 0xd0946a, 0xf0c09a]);
    for (const [x, y] of [[2.5, 13], [30, 10], [29.5, 20]]) { p.fline(x, y, x + 1.6, y + 0.5, CR[4]); p.fline(x, y + 2, x + 1.2, y + 2.4, CR[4]); }
  },
  bore(p) {
    p.box(-1, 7, 34, 8, SO, { lum: 0.55, bevel: 0.8 });
    p.box(-1, 15, 34, 8, RW, { lum: 0.45, bevel: 0.6 });
    p.box(-1, 23, 34, 10, RD_ROCK, { lum: 0.4, bevel: 0.6 });
    for (const [x, y, r] of [[23, 27, 2.6], [27.5, 25, 1.8], [19, 29.5, 1.6], [7, 27.5, 1.8]]) p.rock(x, y, r, x, OR);
    p.ball(15.5, 21, 4.2, 9.6, BK, { gain: 0.18 });
    p.box(12.5, -1, 6, 6.5, OL, { bevel: 0.8 });
    const bit = p.poly([12.3, 5, 18.7, 5, 15.5, 24], GM, (x, y) => 0.5 + (16 - x) / 14 - y / 70);
    p.clip = bit.inside; for (let y = 7; y < 24; y += 3) p.fline(12, y + 2.2, 19, y - 1, GM[1]); p.clip = null;
    p.glow(15.5, 23.2, 2.4, FI, { pow: 0.6 });
    for (const [x, y] of [[10.5, 19], [20.5, 18], [12, 15.5], [19.5, 22], [9, 23]]) p.fdot(x, y, 0.45, FI[4], FI[1]);
    p.fline(17, 21.5, 21.5, 17.5, FI[3]); p.fline(14, 21.5, 10, 18, FI[3]);
  },
  refinery(p) {
    p.box(3, 25.5, 9, 4, OR, { bevel: 0.6, lum: 0.62 }); p.box(5, 21.8, 9, 4, OR, { bevel: 0.6, lum: 0.7 });
    p.poly([16, 27, 30, 27, 28.5, 30.5, 17.5, 30.5], GM, 0.45);
    p.box(17.5, 26.3, 11, 1.6, FI, { lum: 0.85, bevel: 0.2 });
    p.seg(5.5, 9.5, 1, 13.5, 1.3, GM);
    const cr = p.poly([3, 6, 13.5, 2, 18, 11.5, 9, 16.5], GM, (x, y) => 0.75 - (x + y) / 60);
    p.clip = cr.inside; p.poly([11.6, 3.4, 13.8, 2.4, 17.8, 10.9, 15.6, 12], FI, 0.9); p.fline(4, 7.5, 9.5, 15, GM[2]); p.fline(6.5, 5.5, 12, 13.5, GM[3]); p.clip = null;
    p.glow(16.8, 10.6, 2.0, FI, { pow: 0.6 });
    for (let i = 0; i < 9; i++) { const t = i / 8, x = 17.2 + Math.sin(t * 2.4) * 2 + t * 4, y = 11 + t * 15; p.fdot(x, y, 0.9 - t * 0.2, i % 2 ? FI[4] : FI[3], FI[1]); }
    p.glow(22.5, 26.8, 3, FI, { ry: 0.45 });
    for (const [x, y] of [[26, 22], [19.5, 22.5], [28, 19]]) p.fdot(x, y, 0.4, FI[5], FI[2]);
  },
  amp(p) {
    p.under = true; for (const r of [10, 13, 15.5]) p.farc(16, 14.5, r, 0, TAU, VI[r > 12 ? 2 : 3], 0, 0.6, -1, r > 14 ? 2 : 0); p.under = false;
    p.box(9.5, 23, 13, 5, BR, { bevel: 0.9 });
    for (const x of [11.5, 14.5, 17.5, 20.5]) p.seg(x, 28, x, 31, 0.8, GM);
    const tb = p.tank(10, 3, 12, 20.5, GL, { r: 5.5, gain: 0.7 });
    p.clip = tb.inside;
    p.box(11.8, 9, 2.2, 12, GM, { lum: 0.6, bevel: 0.3 }); p.box(18, 9, 2.2, 12, GM, { lum: 0.5, bevel: 0.3 });
    p.glow(16, 14.5, 3.2, FI, { ry: 2.2 }); p.fline(16, 9, 16, 20.5, FI[5]);
    p.fline(12.4, 5.5, 12.4, 18, GL[6], 0, -1, 2);
    p.clip = null;
    p.spark(16, 4.5, 1.6, VI[4], 0xffffff);
  },
  servo(p) {
    p.ring(7, 7, 2.6, 4.6, BR); p.disc(7, 7, 2.7, CR[4]);
    p.farc(7, 7, 2.2, Math.PI * 0.75, Math.PI * 1.25, RE[5], 0.6);
    p.fline(7, 7, 9.2, 5.6, BK[0]); p.fdot(7, 7, 0.5, BK[0]);
    p.seg(7, 11.5, 7, 17, 1.0, CU); p.seg(7, 17, 11, 19, 1.0, CU);
    p.tank(5, 17, 9, 13, OL, { r: 2.5 });
    p.seg(9.5, 20, 19.5, 13.5, 1.6, GM);
    p.ball(10, 19.7, 1.4, 1.4, BR);
    const f = p.rock(22.5, 11.5, 4.8, 51, RW, { sq: 0.9 });
    p.clip = f.inside; p.fline(20, 8, 23, 14, RW[1]); p.fline(22.5, 7.5, 26, 12, RW[1]); p.clip = null;
    impact(p, 27.5, 6.5, 1.8);
    streaks(p, 22.5, 11.5, 1, -0.6, 4, 3, 1.4);
  },
  command(p) {
    p.under = true; for (const r of [5, 8, 11]) p.farc(10, 5.5, r, -0.2, 1.4, r > 9 ? LN[2] : LN[3], 0, 1, -1, r > 6 ? 2 : 0); p.under = false;
    p.seg(10, 12, 10, 3.5, 0.7, GM); p.ball(10, 3.3, 0.9, 0.9, RE);
    head(p, 9, 15, 1.55, 1, { antenna: false });
    for (const [x, y, s] of [[22.5, 15, 0.62], [17.5, 25, 0.62]] as [number, number, number][]) {
      const b = beast(p, x, y, s, -1, FL, { eye: LN, spines: false });
      p.farc(b.top[0], b.top[1] - 1.4, 1.8, 0, TAU, LN[4], 0, 0.35, LN[1]);
    }
    p.fdot(26, 24.5, 0.5, LN[4], LN[1]);
  },
  cloner(p) {
    p.seg(15.5, 3, 16.5, 3, 1.2, CU); p.seg(7.5, 3, 24.5, 3, 1.2, CU);
    for (const x of [2, 17.5]) {
      p.box(x, 1.5, 12.5, 3.6, BR, { bevel: 0.7 });
      const g = p.tank(x + 1, 4.5, 10.5, 21, GL, { r: 1.2, gain: 0.7 });
      p.box(x + 1.7, 8, 9, 17, LB, { bevel: 0.4, lum: 0.6, clip: g.inside });
      p.clip = g.inside; beast(p, x + 6, 16.5, 0.42, 1, LB.map((c) => mixHex(c, 0x000000, 0.35)), { eye: LN, spines: false }); p.fline(x + 2.6, 6, x + 2.6, 23, GL[6], 0, -1, 2); p.clip = null;
      p.box(x, 25, 12.5, 4.5, BR, { bevel: 0.7 });
    }
    p.fline(14.8, 13.5, 17.2, 13.5, LN[4], 0.6, LN[1]); p.fline(14.8, 16, 17.2, 16, LN[4], 0.6, LN[1]);
  },
};

/** names drawn by other vignettes */
const ALIAS: Record<string, string> = {
  core: 'torso', mirror: 'head', helix: 'dna', tree: 'skills', pulse: 'repulse', pull: 'lift', lode: 'magnet', repel: 'repulse',
  em: 'coil', heal: 'cell', points: 'cell', convertAlly: 'ally', fist: 'attack', pick: 'drill', gene: 'dna', lens: 'head',
};
export const HI_ICON_NAMES = [...Object.keys(ART), ...Object.keys(ALIAS)];
export function hasHiIcon(name: string) { return !!ART[name] || !!ALIAS[name]; }

const pcCache = new Map<string, PixelCanvas>();
/** the vignette `name` painted at px x px (art fills px - 4; outline and shadow use the margin), or null */
export function hiIcon(name: string, px = 36, o: { dim?: boolean; shadow?: boolean } = {}): PixelCanvas | null {
  const art = ART[name] ?? ART[ALIAS[name] ?? ''];
  if (!art) return null;
  px = Math.max(12, Math.round(px));
  const key = `${name}|${px}|${o.dim ? 1 : 0}${o.shadow ? 1 : 0}`;
  let pc = pcCache.get(key);
  if (!pc) { const p = new IP(px); art(p); pc = p.canvas(o); pcCache.set(key, pc); }
  return pc;
}
const urlCache = new Map<string, string>();
function pcURL(pc: PixelCanvas) { const c = document.createElement('canvas'); c.width = pc.w; c.height = pc.h; c.getContext('2d')!.putImageData(pc.toImageData(), 0, 0); return c.toDataURL(); }
/** a data URL of the vignette (falls back to the legacy 16 x 16 grid scaled to the nearest integer size) */
export function iconURL(name: string, px = 36, o: { dim?: boolean; shadow?: boolean } = {}): string {
  const key = `${name}|${px}|${o.dim ? 1 : 0}${o.shadow ? 1 : 0}`;
  let u = urlCache.get(key);
  if (!u) { const pc = hiIcon(name, px, o) ?? legacyCanvas(name, Math.max(1, Math.round(px / 18)), o); u = pcURL(pc); urlCache.set(key, u); }
  return u;
}
/** an <img> showing the icon at exactly px CSS pixels (crisp: one source pixel per CSS pixel) */
export function iconEl(name: string, px = 36, cls = 'ico', parent?: HTMLElement, o: { dim?: boolean; shadow?: boolean } = { shadow: true }): HTMLImageElement {
  const i = document.createElement('img'); i.className = cls; i.src = iconURL(name, px, o); i.width = px; i.height = px; i.style.width = px + 'px'; i.style.height = px + 'px'; i.draggable = false;
  parent?.appendChild(i);
  return i;
}

/** skill id -> icon name (every skill in game/skills.ts has its own vignette) */
export const SKILL_ICON: Record<string, string> = {
  head: 'head', torso: 'torso', armR: 'armR', armL: 'armL', coil: 'coil', plating1: 'plating1', plating2: 'plating2', reactor: 'reactor',
  drill: 'drill', intake: 'intake', siphon: 'siphon', excavate: 'excavate', magnet: 'magnet', tanks: 'tanks',
  lift: 'lift', slam: 'slam', repulse: 'repulse', well: 'well', shape: 'shape', storm: 'storm',
  punch: 'punch', rock: 'rock', boulder: 'boulder', shrapnel: 'shrapnel', frenzy: 'frenzy', plow: 'plow',
  graft: 'graft', sow: 'sow', convert: 'convert', print: 'print', grove: 'grove',
  lab: 'lab', splice: 'splice', sequencer: 'sequencer', vat: 'vat',
  plating3: 'plating3', colossus: 'colossus', bore: 'bore', refinery: 'refinery', amp: 'amp', servo: 'servo', command: 'command', cloner: 'cloner',
};
/** resource -> icon name */
export const RES_ICON: Record<string, string> = { ore: 'ore', carbon: 'carbon', water: 'water', soil: 'soil' };
export function skillIcon(id: string): string { return SKILL_ICON[id] ?? (hasHiIcon(id) ? id : 'cell'); }
export function skillIconURL(id: string, px = 36, o: { dim?: boolean; shadow?: boolean } = { shadow: true }) { return iconURL(skillIcon(id), px, o); }

/** the legacy 16 x 16 grid, outlined, upscaled by an integer factor k (18k x 18k) */
export function legacyCanvas(name: string, k = 1, o: { dim?: boolean; shadow?: boolean } = {}): PixelCanvas {
  const g = ICONS[name] ?? ICONS.dna;
  const S = 18, base = new Int32Array(S * S).fill(-1);
  for (let y = 0; y < 16; y++) {
    const row = g[y] ?? '';
    for (let x = 0; x < 16; x++) {
      const ch = row[x]; if (!ch || ch === '.' || ch === ' ') continue;
      let c = PAL[ch]; if (c === undefined) continue;
      if (o.dim) { const l = (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) | 0; c = mixHex((l << 16) | (l << 8) | l, 0x101018, 0.45); }
      base[(y + 1) * S + x + 1] = c;
    }
  }
  const src = new Int32Array(base);
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && src[y * S + x] >= 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (filled(x, y)) continue;
    let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && filled(x + dx, y + dy)) n++;
    if (n) base[y * S + x] = PAL.k;
  }
  const pc = new PixelCanvas(S * k, S * k); pc.wrap = false; pc.clear();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const c = base[y * S + x]; if (c >= 0) pc.rect(x * k, y * k, k, k, c); }
  if (o.shadow) {
    const has = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && base[y * S + x] >= 0;
    for (let y = S - 1; y >= 1; y--) for (let x = S - 1; x >= 1; x--) if (!has(x, y) && has(x - 1, y - 1)) for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) pc.set(x * k + i, y * k + j, 0x000000, 110);
  }
  return pc;
}

// ------------------------------------------------------------------ legacy 16 x 16 grids
// Each is authored as a 16 x 16 grid of palette letters (fills and internal shading only); a 1 px dark outline
// is added around every shape automatically so the whole set shares one weight.
export const PAL: Record<string, number> = {
  k: 0x0a0910, K: 0x2a2634, w: 0xf6f2e8, s: 0xc0bab0, S: 0x7a7480, e: 0x3a3446, E: 0x5c5470,
  g: 0x7affe0, G: 0x2fc49a, n: 0x166a56, m: 0x9cea8a, M: 0x2f9a5e, N: 0x1a4a36,
  v: 0xc4b4ff, V: 0x7a62e8, p: 0x3e2c88, y: 0xffe070, Y: 0xd09030, u: 0x8a5a1a,
  r: 0xff7050, R: 0xb02a2a, b: 0xeee2c4, B: 0xb0a07c, o: 0xffa040, c: 0x6ad0ff, C: 0x2a72b8, x: 0x5a2a1a, f: 0xff8ac0, F: 0xb04a80,
  d: 0x77825a, D: 0x4e593a, h: 0x252b1d,
};

export const ICONS: Record<string, string[]> = {
  bio: [
    '................', '.......gg.......', '......gmmg......', '.....GmmmmG.....', '....GmmmmmmG....', '...GmmMggMmmG...', '...GmMgwwgMmG...', '..GmmMgwggMmmG..',
    '..GmmmMggMmmmM..', '..GmmmmMMmmmmM..', '..MGmmmmmmmmMM..', '...MGmmmmmmMM...', '....MMMMMMMM....', '.....NNNNNN.....', '................', '................'],
  min: [
    '................', '..........s.....', '.........sE.....', '.....s...sEe.s..', '....sE..sEEe.sE.', '....sEe.sEwEesEe', '...sEEe.sEEEesEe', '...sEwEesEEEeeEe',
    '..sEEEEesEEEeeEe', '..sEEEEeeEEeeeee', '..eEEEeeeEeeeee.', '..eeeEeeeeeeee..', '...eeeeeeeeee...', '....KKKKKKKK....', '................', '................'],
  charge: [
    '................', '.........vvvv...', '........vVVv....', '.......vVVv.....', '......vVVv......', '.....vVVvvvvv...', '....vvvvvVVVv...', '...vvVVVVVVv....',
    '......vVVVv.....', '.....vVVVv......', '....vVVv........', '...vVVv.........', '...vVv..........', '...vv...........', '................', '................'],
  helix: [
    '....g......y....', '....gg....yy....', '.....gg..yy.....', '......gyy.......', '......bbbb......', '.....yy..gg.....', '....yy....gg....', '....y......g....',
    '....yy....gg....', '.....yy..gg.....', '......bbbb......', '......ygg.......', '.....gg..yy.....', '....gg....yy....', '....g......y....', '................'],
  supply: [
    '................', '................', '.....bbbbbb.....', '...bbBBBBBBbb...', '..bBBnnnnnnBBb..', '..bBnGGGGGGnBb..', '..bBnGgggggnBb..', '..bBnGgwwggnBb..',
    '..bBnGgggggnBb..', '..bBnGGGGGGnBb..', '..bBBnnnnnnBBb..', '...bbBBBBBBbb...', '.....bbbbbb.....', '................', '................', '................'],
  em: [
    '................', '...VVVV..VVVV...', '..VvvvV..VvvvV..', '..VvVVV..VVVvV..', '..VvV......VvV..', '..VvV......VvV..', '..VvV..gg..VvV..', '..VvV.gwwg.VvV..',
    '..VvV.gwwg.VvV..', '..VvV..gg..VvV..', '..sss......sss..', '..sws......sws..', '..sss......sss..', '................', '................', '................'],
  // buildings
  spire: [
    '.......gg.......', '......gwwg......', '......gggg......', '.......BB.......', '......bBBb......', '.......BB.......', '......bBBb......', '......bnnb......',
    '.....bBnnBb.....', '......bnnb......', '.....bBnnBb.....', '.....bnnnnb.....', '....bBnnnnBb....', '..MM.nnnnnn.MM..', '.MmmMMMMMMMMmmM.', '................'],
  tap: [
    '................', '.......gg.......', '......gwwg......', '.....GGggGG.....', '....GmmmmmmG....', '...GmmmMMmmmG...', '...GmMMMMMMmG...', '...GmMooooMmG...',
    '...GMMooooMMG...', '....GMMMMMMG....', '.....nnnnnn.....', '...n..n..n..n...', '..n...n..n...n..', '..E..EEEEEE..E..', '.EeEEeeeeeeEEeE.', '................'],
  brood: [
    '................', '.....b....b.....', '....bB....Bb....', '...bB.gggg.Bb...', '...B.gGGGGg.B...', '..bB.GgwwgG.Bb..', '..B.gGgwwgGg.B..', '..B.gGGggGGg.B..',
    '..B.gGGGGGGg.B..', '..bB.gGGGGg.Bb..', '...B..gggg..B...', '...bBnnnnnnBb...', '..nnnGGGGGGnnn..', '.MMMMMMMMMMMMMM.', '................', '................'],
  maw: [
    '................', '................', '...b..b..b..b...', '..bB.bB.bB.bB...', '..bB.bB.bB.bBb..', '.MbBMbBMbBMbBM..', 'MMbBbbBbbBbbBMM.', 'MbBkkkkkkkkkbBM.',
    'MbkkKKggggKKkbM.', 'MbkKggwwwwggKbM.', 'MbkkKKggggKKkbM.', 'MbBkkkkkkkkkbBM.', 'MMbBbbBbbBbbBMM.', '.MMMMMMMMMMMMM..', '................', '................'],
  vault: [
    '................', '......gyyg......', '.....y.bb.g.....', '......gyyg......', '.....g.bb.y.....', '......ygg y.....', '.....y.bb.g.....', '......gyyg......',
    '.....g.bb.y.....', '......ygyg......', '.....y.bb.g.....', '......gyyg......', '....bbBBBBbb....', '...bBBBBBBBBb...', '..MMMMMMMMMMMM..', '................'],
  thorn: [
    '................', '.....b....b.....', '..b...b..b...b..', '...b..GGGG..b...', '....bGmmmmGb....', '.bbbGmmMMmmGbbb.', '....GmMggMmG....', '...bGmMggMmGb...',
    '..b.GmmMMmmG.b..', '....bGmmmmGb....', '...b..GGGG..b...', '.......nn.......', '.......nn.......', '.....MMnnMM.....', '....MMMMMMMM....', '................'],
  coil: [
    '.......vv.......', '......vwwv......', '.......vv.......', '....bbbnnbbb....', '.....BBnnBB.....', '....bbbnnbbb....', '.....BBnnBB.....', '....bbbnnbbb....',
    '.....BBnnBB.....', '....bbbnnbbb....', '.....BBnnBB.....', '....bbbnnbbb....', '.......nn.......', '....MMMnnMMM....', '...MMMMMMMMMM...', '................'],
  lure: [
    '................', '....ff....ff....', '...fFFf..fFFf...', '...fFFFffFFFf...', '....fFFggFFf....', '.ffffFgwwgFffff.', 'fFFFFgwyywgFFFFf', '.ffffFgwwgFffff.',
    '....fFFggFFf....', '...fFFFffFFFf...', '...fFFf.MfFFf...', '....ff..M.ff....', '........M.......', '.....MMMMMMM....', '....MMMMMMMMM...', '................'],
  spore: [
    '......gggg......', '.....gwwwwg.....', '...G.gggggg.G...', '..GmG.nnnn.GmG..', '..GmG.nnnn.GmG..', '...G..BBBB..G...', '......bBBb......', '..GG..bBBb..GG..',
    '.GmmG.bBBb.GmmG.', '..GG..bBBb..GG..', '......bBBb......', '.....bBBBBb.....', '....bBBBBBBb....', '..MMMMMMMMMMMM..', '.MMMMMMMMMMMMMM.', '................'],
  core: [
    '................', '.....eeEEe......', '...eeEEEEEEe....', '..eEEgEEEEEEe...', '.eEEEgEEEEEEEe..', '.eEEEggEEMMMEe..', 'eEEEEEgwgMmmMEe.', 'eEEEEEEgwgMMEEe.',
    'eEEEEEEEgEEEEEe.', 'eeEEEEEEgEEEEee.', '.eeEEEEEggEEee..', '..eeeEEEEgEee...', '...eeeeeeeee....', '.MMMMMMMMMMMMMM..', '................', '................'],
  // abilities
  snare: [
    '................', '.....rRRRr......', '....rRrrrRr.....', '....RrwwrrR.....', '....rRrrrRr.....', '.....rRRRr......', '..g..M.M.M..g...', '..M.M..M..M.M...',
    '..M.M.MMM.M.M...', '...MM.MmM.MM....', '....MMMmMMM.....', '.....MMmMM......', '......MmM.......', '...NNNMMMNNN....', '..NNNNNNNNNNN...', '................'],
  pulse: [
    '................', '.....vvvvvv.....', '...vv......vv...', '..v...VVVV...v..', '.v...V....V...v.', '.v..V..gg..V..v.', 'v..V..gwwg..V..v', 'v..V..gwwg..V..v',
    '.v..V..gg..V..v.', '.v...V....V...v.', '..v...VVVV...v..', '...vv......vv...', '.....vvvvvv.....', '................', '................', '................'],
  pull: [
    '................', '..rrrr....ssss..', '..rRRr....sSSs..', '..rRRr....sSSs..', '..rRRr....sSSs..', '..rRRr....sSSs..', '..rRRRrrssSSSs..', '..rRRRRRSSSSSs..',
    '...rRRRRSSSSs...', '....rrrRSsss....', '......rRSs......', '..g...........g.', '...g..g..g...g..', '....g......g....', '................', '................'],
  bloom: [
    '................', '.......mm.......', '...m...mm...m...', '....m..mm..m.....', '.....mmMMmm.....', '..mmmMMggMMmmm..', '.....mMgwgMm....', '..mmmMMggMMmmm..',
    '.....mmMMmm.....', '....m..mm..m....', '...m...mm...m...', '.......mm.......', '..MMMMMMMMMMMM..', '.MMNNNNNNNNNNMM.', '................', '................'],
  lance: [
    '...........vv...', '..........vwv...', '.........vwv....', '........vVv.....', '.......vVv......', '......vVVvv.....', '.....vvvVVv.....', '.......vVv......',
    '......vVv.......', '.....vVv........', '....gVv.........', '...ggg..........', '..ggwgg.........', '...ggg..........', '................', '................'],
  storm: [
    '................', '.....vvvvv......', '...vvV...Vvv....', '..vV..sss..Vv...', '.vV..s...s..Vv..', '.v..s..g..s..v..', 'vV.s..gwg..s.Vv.', 'v..s.gwwwg.s..v.',
    'vV.s..gwg..s.Vv.', '.v..s..g..s..v..', '.vV..s...s..Vv..', '..vV..sss..Vv...', '...vvV...Vvv....', '.....vvvvv......', '................', '................'],
  // commands
  move: [
    '................', '................', '.......gg.......', '......gwwg......', '.....gwggwg.....', '....gwggggwg....', '...gggggggggg...', '......gggg......',
    '......gggg......', '......gggg......', '......gGGg......', '......gGGg......', '......GGGG......', '................', '................', '................'],
  attack: [
    '................', '..b..........b..', '..bb........bb..', '...bb......bb...', '...bBb....bBb...', '....bBb..bBb....', '.....bBbbBb.....', '......bBBb......',
    '......bBBb......', '.....bBbbBb.....', '....rbB..Bbr....', '...rRr....rRr...', '..rRr......rRr..', '..rr........rr..', '................', '................'],
  stop: [
    '................', '.....RRRRRR.....', '....RrrrrrrR....', '...RrrrrrrrrR...', '..RrrwwwwwwrrR..', '..RrrwwwwwwrrR..', '..RrrrrrrrrrrR..', '..RrrwwwwwwrrR..',
    '..RrrwwwwwwrrR..', '..RrrrrrrrrrrR..', '...RrrrrrrrrR...', '....RrrrrrrR....', '.....RRRRRR.....', '................', '................', '................'],
  hold: [
    '................', '...BBBBBBBBBB...', '...BbbbbbbbbB...', '...BbGGGGGGbB...', '...BbGggggGbB...', '...BbGgwwgGbB...', '...BbGggggGbB...', '...BbGGGGGGbB...',
    '....BbGGGGbB....', '.....BbGGbB.....', '......BbbB......', '.......BB.......', '................', '................', '................', '................'],
  rally: [
    '................', '....gggggg......', '....gwwwwgg.....', '....gggggggg....', '....gGGGGGg.....', '....gggggg......', '....B...........', '....B...........',
    '....B...........', '....B...........', '....B...........', '...BBB..........', '..MMMMM.........', '.MMMMMMM........', '................', '................'],
  // gene categories
  'cat-body': [
    '................', '......bbbb......', '.....bBBBBb.....', '......bbbb......', '...bb.bBBb.bb...', '..bBBbbBBbbBBb..', '...bb.bBBb.bb...', '......bbbb......',
    '...bb.bBBb.bb...', '..bBBbbBBbbBBb..', '...bb.bBBb.bb...', '......bbbb......', '.......bb.......', '.......bb.......', '......b..b......', '................'],
  'cat-limb': [
    '................', '...bbbbb........', '...bBBBBb.......', '....bBBBBb......', '.....bbBBb......', '.......bBbb.....', '........bBb.....', '........bBb.....',
    '.......bBb......', '......bBb.......', '.....bBb........', '....bBBbbbb.....', '....bBBBBBBb....', '....kbkbkbk.....', '................', '................'],
  'cat-sense': [
    '................', '................', '.....ssssss.....', '...sswwwwwwss...', '..swwwccccwwws..', '.swwwcCCCCcwwws.', 'swwwcCkkkkCcwwws', 'swwwcCkwkkCcwwws',
    'swwwcCkkkkCcwwws', '.swwwcCCCCcwwws.', '..swwwccccwwws..', '...sswwwwwwss...', '.....ssssss.....', '................', '................', '................'],
  'cat-feed': [
    '................', '..RRRRRRRRRRRR..', '.Rrrrrrrrrrrrrr.', '.Rrwrwrwrwrwrrr.', '.Rrwkwkwkwkwkrr.', '.Rkkkkkkkkkkkkr.', '.Rkkkkkkkkkkkkr.', '.Rrwkwkwkwkwkrr.',
    '.Rrrwrwrwrwrwrr.', '.Rrrrrrrrrrrrrr.', '..RRRRRRRRRRRR..', '................', '................', '................', '................', '................'],
  'cat-defense': [
    '................', '.....YYYYYY.....', '...YYyyyyyyYY...', '..YyyYYYYYYyyY..', '..YyYyyyyyyYyY..', '.YyYyYYYYYYyYyY.', '.YyYyYyyyyYyYyY.', '.YyYyYyYYyYyYyY.',
    '.YyYyYyyyyYyYyY.', '.YyYyYYYYYYyYyY.', '..YyYyyyyyyYyY..', '..YyyYYYYYYyyY..', '...YYyyyyyyYY...', '.....YYYYYY.....', '................', '................'],
  'cat-meta': [
    '................', '...RR.....RR....', '..RrrR...RrrR...', '.RrwrrR.RrrrrR..', '.RrwrrrRrrrrrR..', '.RrrrrrrrrrrrR..', '.RrrrrrrrrrrrR..', '..RrrrrrrrrrR...',
    '...RrrrrrrrR....', '....RrrrrrR.....', '.....RrrrR......', '......RrR.......', '.......R........', '................', '................', '................'],
  'cat-repro': [
    '................', '.......bb.......', '.....bbwwbb.....', '....bwwwwwwb....', '...bwwbbbbwwb...', '...bwbwwwwbwb...', '..bwbwwwwwwbwb..', '..bwbwwgwwwbwb..',
    '..bwbwwwwwwbwb..', '..bBbwwwwwwbBb..', '...bBbwwwwbBb...', '...bBBbbbbBBb...', '....bBBBBBBb.....', '.....bbbbbb.....', '................', '................'],
  dna: [
    '................', '...gg......yy...', '....gg....yy....', '.....gwbbwy.....', '......gyyg......', '.....yybbgg.....', '....yy....gg....', '...yy......gg...',
    '....yy....gg....', '.....yybbgg.....', '......gyyg......', '.....gwbbwy.....', '....gg....yy....', '...gg......yy...', '................', '................'],
  tree: [
    '................', '.......gg.......', '.......gg.......', '...gg..BB..gg...', '...gg..BB..gg...', '....BBBBBBBB....', '.......BB.......', '..yy...BB...cc..',
    '..yy...BB...cc..', '...BBBBBBBBBB...', '.......BB.......', '.......BB.......', '......BBBB......', '....MMMMMMMM....', '................', '................'],
  planet: [
    '................', '.....CCCCCC.....', '...CCcccMMcCC...', '..CcccMMMMMccC..', '..CccMMMmMMccC..', '.CcccMMmmMcccMC.', '.CccccMMMcccMMC.', '.CcMMccccccMMMC.',
    '.CcMMMccccMMmMC.', '.CccMMcccccMMcC.', '..CccccMMcccccC.', '..CCccMMMMccCC..', '...CCCccccCCC...', '.....CCCCCC.....', '................', '................'],
  builder: [
    '................', '.......gg.......', '......gwwg......', '.....bbggbb.....', '....bBBBBBBb....', '...bBGGGGGGBb...', '...bBGgMMgGBb...', '...bBGMmmMGBb...',
    '....bBGMMGBb....', '....bbBGGBbb....', '...bb.bBBb.bb...', '..bb..bBBb..bb..', '..b...bBBb...b..', '.....bb..bb.....', '................', '................'],
  shape: [
    '................', '......EEEE......', '.....EsssEe.....', '....EswsssEe....', '....EsssseEe....', '.....eEEEee.....', '......g..g......', '.....g.gg.g.....',
    '................', '......uuuu......', '....uuYYYYuu....', '...uYYyyyyYYu...', '..uYyyyyyyyyYu..', '.uYYYYYYYYYYYYu.', '.uuuuuuuuuuuuuu.', '................'],
  // Unit 07's head: an asteroid skull, a brass porthole camera lens, an olive riveted jaw band
  mirror: [
    '................', '.....eSSSSe.....', '...eSSsSSSSSe...', '..eSsSSSeSrSSe..', '..SSSuYYYYuSSe..', '.eSSuYyyyyYuSSe.', '.eSuYykkkkyYuSe.', '.eSuykCcwkkyuSe.',
    '.eSuykCckkkyuSe.', '.eSuYykkkkyYuSe.', '.eSSuYyyyyYuSSe.', '..eSSuYYYYuSSe..', '..hdDdDdDdDdDh..', '..hDbDDbDDbDDh..', '...hhhhhhhhhh...', '................'],
  lode: [
    '................', '......o.....u...', '...u.....o......', '........u....o..', '................', '....ss....ss....', '....ss....ss....', '....RR....RR....',
    '....RR....RR....', '....RRr..rRR....', '.....RRRRRR.....', '......RRRR......', '................', '................', '................', '................'],
  repel: [
    '......RRRR......', '.....RRRRRR.....', '....RRr..rRR....', '....RR....RR....', '....RR....RR....', '....ss....ss....', '....ss....ss....', '................',
    '...g...gg...g...', '..g..g....g..g..', '.g............g.', 'g..g........g..g', '................', '................', '................', '................'],
  pause: [
    '................', '................', '....bbb..bbb....', '....bBb..bBb....', '....bBb..bBb....', '....bBb..bBb....', '....bBb..bBb....', '....bBb..bBb....',
    '....bBb..bBb....', '....bBb..bBb....', '....bBb..bBb....', '....bbb..bbb....', '................', '................', '................', '................'],
  heart: [
    '................', '................', '..RRR....RRR....', '.RrrrR..RrrrR...', 'RrwwrrRRrrrrrR..', 'RrwrrrrrrrrrrR..', 'RrrrrrrrrrrrrR..', '.RrrrrrrrrrrR...',
    '..RrrrrrrrrR....', '...RrrrrrrR.....', '....RrrrrR......', '.....RrrR.......', '......RR........', '................', '................', '................'],
  skull: [
    '................', '.....bbbbbb.....', '...bbBbbbbBbb...', '..bBbbbbbbbbBb..', '..bbbbbbbbbbbb..', '..bkkkbbbbkkkb..', '..bkkkbbbbkkkb..', '..bbbbbkkbbbbb..',
    '...bbbbkkbbbb...', '....bbbbbbbb....', '....bkbkbkbk....', '.....bbbbbb.....', '................', '................', '................', '................'],
};
