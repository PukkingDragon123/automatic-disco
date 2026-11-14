// Icons. Two sets share one name space:
//
//  * HI-RES VIGNETTES (the main set): small scenes of Unit 07 using each ability, drawn the way a pixel artist draws
//    them, by a resolution-independent painter. Shapes are authored on a 32-unit grid and rasterised at the size
//    they are shown at (1 source pixel = 1 screen pixel, crisp at any UI scale). Every form is an angular silhouette:
//    hand-placed polygons, faceted stones cut from irregular outlines, chamfered plates, pointed leaves built on a
//    spine. Shading is planar, lit from the upper left: one ramp step per plane, 3-5 tones per material in flat
//    clusters, a bright highlight edge where a lit plane meets the sky, and a tiny specular glint on hard, glossy
//    and wet things; no circles, no gradients, no noise, no dithering. Colours come only from the master ramps
//    (art/palette.ts), picked by material. Every silhouette gets a 1 px outline in the darkest step of its own
//    ramp (ink for pale ones), and a part that overlaps another gets an inner line. Source art is 24-47 px,
//    blown up by whole pixels for bigger sizes. Texture is drawn marks: cracks in stone, veins in leaves,
//    knuckle seams, bark strokes. An fx layer (lit lenses, sparks, field strokes, motion lines, flat light patches)
//    sits over the solids without an outline (or under them).
//  * LEGACY 16 x 16 grids (ICONS / PAL, at the bottom): the older hand-pixelled set. Any name without a vignette
//    falls back to it (upscaled by an integer factor).
//
// API: hiIcon(name, px) -> PixelCanvas | null, iconURL(name, px), skillIcon(id) -> icon name, skillIconURL(id),
// hasHiIcon(name), HI_ICON_NAMES. ui/pixelart.ts icon(name) uses the vignettes at the HUD's current scale.
import { PixelCanvas } from '../limbo/gfx/pixel';
import { RAMPS } from '../art/palette';
import { SKILL } from '../game/skills';

type Ramp = readonly number[];
type Inside = (x: number, y: number) => boolean;
type Lum = (x: number, y: number) => number;

// ------------------------------------------------------------------ palette: master ramps, picked by material
const RK = RAMPS.stone;       // Unit 07's asteroid rock
const RW = RAMPS.clay;        // warm boulders: fists, thrown stones
const RD_ROCK = RAMPS.basalt; // dark ore rock
const BR = RAMPS.brass, GM = RAMPS.steel, OL = RAMPS.olive, CU = RAMPS.rust, VI = RAMPS.violet;
const LN = RAMPS.glowTeal;    // lit lenses, reactor light, Veyr glow (sparingly)
const FI = RAMPS.glowAmber;   // sparks, fire, molten metal (sparingly)
const WA = RAMPS.water, SO = RAMPS.soil, PL = RAMPS.moss, CB = RAMPS.moss, VE = RAMPS.teal, SG = RAMPS.sage, OR = RAMPS.ochre;
const FL = RAMPS.flesh, BN = RAMPS.bone, GL = RAMPS.slate, RE = RAMPS.stampRed, CO = RAMPS.coral, BK = RAMPS.basalt;
const LB = RAMPS.ichor, BW = RAMPS.fur, CR = RAMPS.paper, SN = RAMPS.snow, HZ = RAMPS.ochre, INK = RAMPS.ink;
const LBD: Ramp = [LB[0], LB[1], LB[2]]; // a shape seen through lab fluid
/** hard, glossy or wet materials: their parts get a specular glint */
const GLOSSY = new Set<Ramp>([GM, BR, OL, GL, WA, LN, RE, RAMPS.iron, RAMPS.copper, RAMPS.gold, RAMPS.quartz, RAMPS.malachite, RAMPS.amethyst, RAMPS.ruby, RAMPS.sapphire, OR, SN]);
const luma = (c: number) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11;
const OUT = INK[0], HOT = CR[5];

// ------------------------------------------------------------------ painter
const LX = -0.6, LY = -0.8; // toward the light (upper left)
// plane levels: a plane facing away, side-on, the flat crown, facing the light. Each lands on one ramp step.
const P_SH = 0.28, P_MID = 0.47, P_TOP = 0.66, P_LIT = 0.84;
/** the level of a plane from its outward normal */
function plane(nx: number, ny: number) { const L = Math.sqrt(nx * nx + ny * ny) || 1, d = (nx * LX + ny * LY) / L; return d > 0.38 ? P_LIT : d < -0.38 ? P_SH : P_MID; }
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const h1 = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const TAU = Math.PI * 2;
/** even-odd point-in-polygon */
function inPoly(pts: number[]): Inside {
  return (x, y) => {
    let c = false;
    for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
      const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
}
function bbox(pts: number[]) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
  return [x0, y0, x1, y1];
}
/** inside a regular N-gon (vertex radius r, squashed by ry): the angular stand-in wherever a circle would go */
function ngon(cx: number, cy: number, r: number, ry = 1, N = 8, rot = 0): Inside {
  const ap = Math.cos(Math.PI / N) * r, ns: number[] = [];
  for (let i = 0; i < N; i++) { const a = rot + (i / N) * TAU; ns.push(Math.cos(a), Math.sin(a)); }
  return (x, y) => { const dx = x - cx, dy = (y - cy) / ry; for (let i = 0; i < N; i++) if (dx * ns[2 * i] + dy * ns[2 * i + 1] > ap) return false; return true; };
}
const dimC = (c: number) => { const l = ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11; return GM[clamp(Math.round((l / 255) * 6 * 0.75), 0, 5)]; };

interface SOpt { part?: number; amb?: number; gain?: number; clip?: Inside; min?: boolean; gloss?: boolean }

class IP {
  readonly W: number; readonly k: number;
  readonly rid: Int16Array; readonly ri: Int8Array; readonly part: Int16Array;
  readonly fxo: Int32Array; readonly fxu: Int32Array; readonly halo: Int32Array;
  private ramps: Ramp[] = []; private rmap = new Map<Ramp, number>();
  pid = 0;
  private gloss = new Set<number>();
  /** a clip applied to every primitive while set */
  clip: Inside | null = null;
  /** fx primitives go under the solids (patches, strokes behind things) while set */
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
  /** rasterise a solid over a unit bounding box: each pixel takes the one ramp step of the plane it lies in */
  solid(x0: number, y0: number, x1: number, y1: number, inside: Inside, ramp: Ramp, lum: Lum, o: SOpt = {}) {
    const part = o.part ?? ++this.pid, id = this.rampId(ramp), n = ramp.length, W = this.W;
    if (o.gloss ?? GLOSSY.has(ramp)) this.gloss.add(part);
    const amb = o.amb ?? 0, gain = o.gain ?? 1, clip = o.clip ?? this.clip;
    const step = (ux: number, uy: number) => clamp(Math.floor(clamp(amb + lum(ux, uy) * gain, 0, 1) * (n - 1) + 0.5), 0, n - 1);
    const px0 = Math.max(0, Math.floor(this.X(x0)) - 1), px1 = Math.min(W - 1, Math.ceil(this.X(x1)) + 1);
    const py0 = Math.max(0, Math.floor(this.X(y0)) - 1), py1 = Math.min(W - 1, Math.ceil(this.X(y1)) + 1);
    let hit = 0;
    for (let py = py0; py <= py1; py++) for (let px = px0; px <= px1; px++) {
      const ux = this.U(px), uy = this.U(py);
      if (!inside(ux, uy) || (clip && !clip(ux, uy))) continue;
      const i = py * W + px;
      this.rid[i] = id; this.ri[i] = step(ux, uy); this.part[i] = part; hit++;
    }
    if (!hit && o.min) { // too small to cover a pixel centre: still one pixel, never nothing
      const ux = (x0 + x1) / 2, uy = (y0 + y1) / 2, px = Math.floor(this.X(ux)), py = Math.floor(this.X(uy));
      if (px >= 0 && py >= 0 && px < W && py < W && (!clip || clip(ux, uy))) { const i = py * W + px; this.rid[i] = id; this.ri[i] = step(ux, uy); this.part[i] = part; }
    }
    return part;
  }
  // ---- primitives (all angular)
  poly(pts: number[], ramp: Ramp, lum: number | Lum, o: SOpt = {}) {
    const [x0, y0, x1, y1] = bbox(pts), inside = inPoly(pts);
    const f: Lum = typeof lum === 'number' ? () => lum : lum;
    const part = this.solid(x0, y0, x1, y1, inside, ramp, f, o);
    return { part, inside };
  }
  /** a faceted form cut from an outline: each edge is a side plane, a flat crown plane sits off-centre toward the light */
  gem(pts: number[], ramp: Ramp, o: SOpt & { crown?: number; top?: number } = {}) {
    const N = pts.length / 2;
    let cx = 0, cy = 0; for (let i = 0; i < N; i++) { cx += pts[2 * i]; cy += pts[2 * i + 1]; } cx /= N; cy /= N;
    let size = 0; for (let i = 0; i < N; i++) size = Math.max(size, Math.abs(pts[2 * i] - cx), Math.abs(pts[2 * i + 1] - cy));
    const cr = o.crown ?? 0.24, kx = cx + LX * size * cr, ky = cy + LY * size * cr, top = o.top ?? 0.5;
    const nx: number[] = [], ny: number[] = [], h: number[] = [], lv: number[] = [];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, ax = pts[2 * i], ay = pts[2 * i + 1], bx = pts[2 * j], by = pts[2 * j + 1];
      let ex = by - ay, ey = ax - bx; const L = Math.sqrt(ex * ex + ey * ey) || 1; ex /= L; ey /= L;
      if (((ax + bx) / 2 - cx) * ex + ((ay + by) / 2 - cy) * ey < 0) { ex = -ex; ey = -ey; }
      nx.push(ex); ny.push(ey); h.push(Math.max(0.15, (ax - kx) * ex + (ay - ky) * ey)); lv.push(plane(ex, ey));
    }
    const lum: Lum = (x, y) => {
      let b = -1e9, bi = 0;
      for (let i = 0; i < N; i++) { const m = ((x - kx) * nx[i] + (y - ky) * ny[i]) / h[i]; if (m > b) { b = m; bi = i; } }
      return b < top ? P_TOP : lv[bi];
    };
    return { ...this.poly(pts, ramp, lum, o), lum };
  }
  /** a flat plate cut to any outline (concave too), its rim bevelled: each edge's band is one plane, the face another */
  bevel(pts: number[], ramp: Ramp, o: SOpt & { w?: number; lum?: number } = {}) {
    const N = pts.length / 2, w2 = (o.w ?? 1.2) ** 2, face = o.lum ?? P_MID;
    let area = 0; for (let i = 0; i < N; i++) { const j = (i + 1) % N; area += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1]; }
    const sg = area > 0 ? 1 : -1, lv: number[] = [];
    for (let i = 0; i < N; i++) { const j = (i + 1) % N; lv.push(plane(sg * (pts[2 * j + 1] - pts[2 * i + 1]), -sg * (pts[2 * j] - pts[2 * i]))); }
    const lum: Lum = (x, y) => {
      let b = 1e9, bi = 0;
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N, ax = pts[2 * i], ay = pts[2 * i + 1], ex = pts[2 * j] - ax, ey = pts[2 * j + 1] - ay;
        const t = clamp(((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1), 0, 1), dx = x - ax - ex * t, dy = y - ay - ey * t, d = dx * dx + dy * dy;
        if (d < b) { b = d; bi = i; }
      }
      return b < w2 ? lv[bi] : face;
    };
    return this.poly(pts, ramp, lum, o);
  }
  /** an irregular stone: a jagged outline of 5-8 corners, faceted, with a crack or two drawn in */
  rock(cx: number, cy: number, r: number, seed: number, ramp: Ramp, o: SOpt & { sq?: number; n?: number; jag?: number; rot?: number; cracks?: number } = {}) {
    const rp = r * this.k, N = o.n ?? (rp < 2.5 ? 5 : rp < 6 ? 6 : 8), sq = o.sq ?? 0.86, jag = o.jag ?? 0.24, rot = o.rot ?? h1(seed, 9) * TAU;
    const pts: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = rot + ((i + (h1(seed + i, 5) - 0.5) * 0.5) / N) * TAU, rr = r * (1.04 - jag + h1(seed + i, 3) * jag);
      pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * sq);
    }
    const g = this.gem(pts, ramp, { min: true, ...o });
    const nc = o.cracks ?? (rp >= 9 ? 2 : rp >= 4.5 ? 1 : 0);
    for (let c = 0; c < nc; c++) {
      const i = Math.floor(h1(seed, 11 + c) * N) % N, vx = pts[2 * i], vy = pts[2 * i + 1];
      const t1 = 0.26 + h1(seed, 13 + c) * 0.12, t2 = 0.5 + h1(seed, 15 + c) * 0.15, kk = (h1(seed, 17 + c) - 0.5) * r * 0.3;
      this.mark([vx, vy, vx + (cx - vx) * t1 + kk, vy + (cy - vy) * t1 - kk, vx + (cx - vx) * t2, vy + (cy - vy) * t2], g.part, 1);
    }
    return g;
  }
  /** a rounded thing (head, joint, orb, bulb) drawn as an irregular faceted polygon, never a circle */
  ball(cx: number, cy: number, rx: number, ry: number, ramp: Ramp, o: SOpt & { rot?: number; n?: number; seed?: number; crown?: number; top?: number } = {}) {
    const R = Math.max(rx, ry), rot = o.rot ?? 0, s = o.seed ?? Math.round(cx * 7.3 + cy * 13.1 + R * 3);
    const N = o.n ?? clamp(Math.round(5 + R * this.k * 0.3), 5, 9), a0 = h1(s, 2) * TAU, c = Math.cos(rot), si = Math.sin(rot);
    const pts: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = a0 + ((i + (h1(s + i, 4) - 0.5) * 0.45) / N) * TAU, rr = 1.08 - h1(s + i, 6) * 0.1;
      const lx = Math.cos(a) * rx * rr, ly = Math.sin(a) * ry * rr;
      pts.push(cx + lx * c - ly * si, cy + lx * si + ly * c);
    }
    return this.gem(pts, ramp, { min: true, ...o });
  }
  /** a pointed leaf on a curved spine: an asymmetric width profile, folded along the midrib (lit half, shade half), veined */
  leaf(x0: number, y0: number, x1: number, y1: number, w: number, ramp: Ramp, o: SOpt & { bend?: number; lean?: number; vein?: boolean } = {}) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const bend = (o.bend ?? 0.1) * L, lean = o.lean ?? 0.25, wa = (w / 2) * (1 + lean), wb = (w / 2) * (1 - lean);
    const prof = [0, 0.14, 0.2, 0.66, 0.42, 1, 0.68, 0.74, 0.88, 0.3, 1, 0];
    const sp = (t: number) => Math.sin(t * Math.PI) * bend;
    const A: number[] = [], B: number[] = [];
    for (let i = 0; i < prof.length; i += 2) {
      const t = prof[i], kk = prof[i + 1], bx = x0 + dx * t + nx * sp(t), by = y0 + dy * t + ny * sp(t);
      A.push(bx + nx * kk * wa, by + ny * kk * wa); B.push(bx - nx * kk * wb, by - ny * kk * wb);
    }
    const pts = [...A]; for (let i = B.length - 4; i >= 0; i -= 2) pts.push(B[i], B[i + 1]);
    const litA = plane(nx, ny) >= plane(-nx, -ny);
    const lum: Lum = (x, y) => { const t = clamp(((x - x0) * ux + (y - y0) * uy) / L, 0, 1), s = (x - x0) * nx + (y - y0) * ny - sp(t); return (s >= 0) === litA ? P_TOP : P_SH + 0.06; };
    const r = this.poly(pts, ramp, lum, o);
    if (o.vein !== false && L * this.k >= 7) { const v: number[] = []; for (const t of [0.06, 0.4, 0.78]) v.push(x0 + dx * t + nx * sp(t), y0 + dy * t + ny * sp(t)); this.mark(v, r.part, ramp.length > 5 ? 1 : 0); }
    return r;
  }
  /** a bevelled plate: lit top and left bands, shadowed bottom and right, a flat face; r chamfers the corners */
  box(x: number, y: number, w: number, h: number, ramp: Ramp, o: SOpt & { bevel?: number; lum?: number; r?: number } = {}) {
    const b = o.bevel ?? Math.min(1.1, Math.min(w, h) * 0.2), base = o.lum ?? 0.55, rr = (o.r ?? 0) * 0.8;
    const inside: Inside = (px, py) => {
      if (px < x || py < y || px > x + w || py > y + h) return false;
      return !rr || Math.min(px - x, x + w - px) + Math.min(py - y, y + h - py) >= rr;
    };
    const lum: Lum = (px, py) => {
      const dt = py - y, dl = (px - x) * 1.3, db = y + h - py, dr = (x + w - px) * 1.3, m = Math.min(dt, dl, db, dr);
      if (m >= b) return base;
      return m === dt ? base + 0.28 : m === dl ? base + 0.14 : m === db ? base - 0.26 : base - 0.15;
    };
    const part = this.solid(x, y, x + w, y + h, inside, ramp, lum, o);
    return { part, inside };
  }
  /** a tank or tube: chamfered ends, vertical bands of light (rim, highlight, body, shadow) */
  tank(x: number, y: number, w: number, h: number, ramp: Ramp, o: SOpt & { r?: number } = {}) {
    const rr = (o.r ?? w * 0.3) * 0.8;
    const inside: Inside = (px, py) => {
      if (px < x || py < y || px > x + w || py > y + h) return false;
      return Math.min(px - x, x + w - px) + Math.min(py - y, y + h - py) >= rr;
    };
    const lum: Lum = (px) => { const t = (px - x) / w; return t < 0.12 ? P_MID : t < 0.36 ? P_LIT : t < 0.7 ? P_TOP : P_SH; };
    const part = this.solid(x, y, x + w, y + h, inside, ramp, lum, o);
    return { part, inside };
  }
  /** a rod: square-ish pointed ends, lit band toward the light, shadow band away */
  seg(x0: number, y0: number, x1: number, y1: number, w: number, ramp: Ramp, o: SOpt = {}) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy) || 1e-6, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const hw = Math.max(w / 2, 0.55 / this.k), cap = hw * 0.6;
    const side = nx * LX + ny * LY, sg = side >= 0 ? 1 : -1, flat = Math.abs(side) < 0.22;
    const inside: Inside = (x, y) => {
      const px = x - x0, py = y - y0, t = px * ux + py * uy, q = Math.abs(px * nx + py * ny), ov = Math.max(0, -t, t - L);
      return ov <= cap && q <= hw - ov * 0.7;
    };
    const lum: Lum = (x, y) => {
      const s = (((x - x0) * nx + (y - y0) * ny) / hw) * sg;
      if (flat) return s > 0.3 ? P_TOP : P_MID;
      return s > 0.3 ? P_LIT : s < -0.4 ? P_SH : P_MID;
    };
    const part = this.solid(Math.min(x0, x1) - hw - cap, Math.min(y0, y1) - hw - cap, Math.max(x0, x1) + hw + cap, Math.max(y0, y1) + hw + cap, inside, ramp, lum, o);
    return { part, inside };
  }
  /** a raised ring (porthole, bezel, coil) as an N-sided band: each side is two planes, the outer slope and the inner */
  ring(cx: number, cy: number, r0: number, r1: number, ramp: Ramp, o: SOpt & { ry?: number; n?: number; rot?: number } = {}) {
    const ry = o.ry ?? 1, N = o.n ?? clamp(Math.round(6 + r1 * this.k * 0.25), 6, 10);
    const rot = o.rot ?? (h1(Math.round(cx * 5 + cy * 9), 1) * TAU) / N, ca = Math.cos(Math.PI / N);
    const ns: number[] = [], lvO: number[] = [], lvI: number[] = [];
    for (let i = 0; i < N; i++) { const a = rot + (i / N) * TAU, ex = Math.cos(a), ey = Math.sin(a); ns.push(ex, ey); lvO.push(plane(ex, ey / ry)); lvI.push(plane(-ex, -ey / ry)); }
    let NB = 0, NI = 0;
    const norm = (x: number, y: number) => {
      const dx = x - cx, dy = (y - cy) / ry; let b = -1e9, bi = 0;
      for (let i = 0; i < N; i++) { const d = dx * ns[2 * i] + dy * ns[2 * i + 1]; if (d > b) { b = d; bi = i; } }
      NB = b / ca; NI = bi;
    };
    const thin = (r1 - r0) * this.k < 2.5;
    const inside: Inside = (x, y) => { norm(x, y); return NB >= r0 && NB <= r1; };
    const lum: Lum = (x, y) => { norm(x, y); return thin || (NB - r0) / (r1 - r0) >= 0.5 ? lvO[NI] : lvI[NI]; };
    const part = this.solid(cx - r1, cy - r1 * ry, cx + r1, cy + r1 * ry, inside, ramp, lum, o);
    return { part, inside };
  }
  /** a flat octagonal fill of one colour (a dial face, a hole) */
  disc(cx: number, cy: number, r: number, c: number, o: SOpt = {}) {
    const inside = ngon(cx, cy, r, 1, 8, Math.PI / 8);
    return { part: this.solid(cx - r, cy - r, cx + r, cy + r, inside, [c], () => 0, { min: true, ...o }), inside };
  }
  rivet(x: number, y: number, r = 0.55, ramp: Ramp = BR) { return this.ball(x, y, r, r, ramp, { n: 5 }); }
  /** a drawn mark on a part already painted: a 1 px polyline that drops that part's pixels to step v (cracks, veins, seams) */
  mark(pts: number[], part: number, v: number) {
    const W = this.W;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const ax = this.X(pts[i]), ay = this.X(pts[i + 1]), bx = this.X(pts[i + 2]), by = this.X(pts[i + 3]);
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
      for (let s = 0; s <= n; s++) {
        const x = Math.floor(ax + ((bx - ax) * s) / n), y = Math.floor(ay + ((by - ay) * s) / n);
        if (x < 0 || y < 0 || x >= W || y >= W) continue;
        const j = y * W + x; if (this.rid[j] >= 0 && this.part[j] === part) this.ri[j] = Math.min(this.ri[j], v);
      }
    }
  }
  // ---- fx layer (not outlined)
  private fset(px: number, py: number, c: number, halo = -1) {
    px = Math.floor(px); py = Math.floor(py);
    if (px < 0 || py < 0 || px >= this.W || py >= this.W) return;
    const i = py * this.W + px;
    if (this.clip && !this.clip(this.U(px), this.U(py))) return;
    (this.under ? this.fxu : this.fxo)[i] = c;
    if (halo >= 0) this.halo[i] = halo;
  }
  private fill(inside: Inside, x0: number, y0: number, x1: number, y1: number, col: (ux: number, uy: number) => number, halo = -1) {
    const W = this.W;
    const px0 = Math.max(0, Math.floor(this.X(x0)) - 1), px1 = Math.min(W - 1, Math.ceil(this.X(x1)) + 1);
    const py0 = Math.max(0, Math.floor(this.X(y0)) - 1), py1 = Math.min(W - 1, Math.ceil(this.X(y1)) + 1);
    for (let py = py0; py <= py1; py++) for (let px = px0; px <= px1; px++) { const ux = this.U(px), uy = this.U(py); if (inside(ux, uy)) this.fset(px, py, col(ux, uy), halo); }
  }
  /** a lit lens: a flat lit face, a brighter patch toward the light, a darker rim on big ones, a glint. No gradient. */
  glow(cx: number, cy: number, r: number, ramp: Ramp, o: { ry?: number; halo?: boolean } = {}) {
    const ry = o.ry ?? 1, n = ramp.length, rp = r * this.k;
    if (rp < 1.2) { this.fdot(cx, cy, r, ramp[n - 1]); return; }
    const body = ngon(cx, cy, r, ry, 8, 0), rim = rp >= 3 ? ngon(cx, cy, r * 0.74, ry, 8, 0) : null;
    const hx = cx - r * 0.24, hy = cy - r * 0.24 * ry, hot = ngon(hx, hy, r * 0.5, ry, 6, 0.3);
    const cHot = ramp[Math.max(0, n - 2)], cRim = ramp[Math.max(0, n - 4)], cBody = ramp[Math.max(0, n - 3)];
    this.fill(body, cx - r, cy - r * ry, cx + r, cy + r * ry, (x, y) => (hot(x, y) ? cHot : rim && !rim(x, y) ? cRim : cBody), o.halo ? ramp[0] : -1);
    if (rp >= 2) { const gx = this.X(hx - r * 0.18), gy = this.X(hy - r * 0.18 * ry); this.fset(gx, gy, ramp[n - 1]); if (rp >= 4.5) this.fset(gx + 1, gy, ramp[n - 1]); }
  }
  /** a flat angular patch: a cast shadow, a pool of light on the ground (c2: a smaller lit patch inside, toward the light) */
  plate(cx: number, cy: number, rx: number, ry: number, c: number, c2 = -1) {
    const s = Math.round(cx * 5 + cy * 3), pts: number[] = [];
    for (let i = 0; i < 6; i++) { const a = h1(s, 1) * 0.6 + ((i + (h1(s + i, 2) - 0.5) * 0.3) / 6) * TAU, rr = 1 - h1(s + i, 3) * 0.14; pts.push(cx + Math.cos(a) * rx * rr, cy + Math.sin(a) * ry * rr); }
    this.fpoly(pts, c);
    if (c2 >= 0) { const q: number[] = []; for (let i = 0; i < pts.length; i += 2) q.push(cx - rx * 0.12 + (pts[i] - cx) * 0.55, cy - ry * 0.12 + (pts[i + 1] - cy) * 0.5); this.fpoly(q, c2); }
  }
  fpoly(pts: number[], c: number, halo = -1) { const [x0, y0, x1, y1] = bbox(pts); this.fill(inPoly(pts), x0, y0, x1, y1, () => c, halo); }
  /** a 1 px line (or a square brush w units wide), stepped along its long axis so the staircase stays tidy */
  fline(x0: number, y0: number, x1: number, y1: number, c: number, w = 0, halo = -1, dash = 0) {
    const ax = this.X(x0), ay = this.X(y0), bx = this.X(x1), by = this.X(y1);
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)))), wp = Math.max(1, Math.round(w * this.k)), lo = -Math.floor((wp - 1) / 2), hi = Math.ceil((wp - 1) / 2);
    const dl = Math.max(1, Math.round(dash * this.k));
    for (let i = 0; i <= n; i++) {
      if (dash && Math.floor(i / dl) % 2) continue;
      const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n;
      for (let oy = lo; oy <= hi; oy++) for (let ox = lo; ox <= hi; ox++) this.fset(x + ox, y + oy, c, halo);
    }
  }
  /** an arc drawn as a few straight strokes, slightly off true; a full ring is never quite closed */
  farc(cx: number, cy: number, r: number, a0: number, a1: number, c: number, w = 0, ry = 1, halo = -1, dash = 0) {
    const rp = r * this.k, sides = rp < 6 ? 7 : rp < 12 ? 9 : 11, span = a1 - a0, full = Math.abs(span) >= TAU - 0.01;
    const n = Math.max(2, Math.round((Math.abs(span) / TAU) * sides)), s = Math.round(cx * 3 + cy * 7 + r * 11);
    const P = (i: number): [number, number] => {
      const j = i % n ? 1 : full ? 0 : 1, e = i === 0 || i === n ? 0 : j;
      const a = a0 + (span * i) / n + (h1(s + i, 1) - 0.5) * (0.45 / sides) * TAU * e, rr = r * (1 + (h1(s + i, 2) - 0.5) * 0.1 * e);
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * ry];
    };
    const gap = full ? Math.floor(h1(s, 9) * n) : -1;
    for (let i = 0; i < n; i++) {
      if (i === gap || (dash && i % 2)) continue;
      const [x0, y0] = P(i), [x1, y1] = P(i + 1); this.fline(x0, y0, x1, y1, c, w, halo);
    }
  }
  /** a cluster: 1 px (a glint), 2 x 2, or a small octagon */
  fdot(cx: number, cy: number, r: number, c: number, halo = -1) {
    const rp = r * this.k, X = this.X(cx), Y = this.X(cy);
    if (rp < 0.8) { this.fset(X, Y, c, halo); return; }
    if (rp < 1.5) { const x = Math.floor(X - 0.5), y = Math.floor(Y - 0.5); for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) this.fset(x + a, y + b, c, halo); return; }
    this.fill(ngon(cx, cy, r, 1, 8, 0), cx - r, cy - r, cx + r, cy + r, () => c, halo);
  }
  /** a four-point star, arms of unequal length, a hot cluster at the core */
  spark(cx: number, cy: number, s: number, c: number, hot = HOT, halo = -1) {
    this.fline(cx - s * 0.8, cy, cx + s, cy, c, 0, halo); this.fline(cx, cy - s * 0.95, cx, cy + s * 0.7, c, 0, halo);
    if (s * this.k >= 2.5) { const d = s * 0.38; this.fline(cx - d, cy - d, cx + d, cy + d, c, 0, halo); this.fline(cx - d * 0.8, cy + d * 0.8, cx + d * 0.8, cy - d * 0.8, c, 0, halo); }
    this.fdot(cx, cy, Math.max(0.5, s * 0.2), hot, halo);
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
      // a bright highlight edge where a lit plane turns away into open sky, above or to the left (the light's side)
      if (len > 2 && v >= Math.ceil((len - 1) * 0.5) && (!solid(x, y - 1) || !solid(x - 1, y))) v = Math.min(len - 1, v + 1);
      // an inner line where a part in front of this one begins
      const a = part[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (solid(X, Y) && part[Y * W + X] > a) { v = Math.max(0, Math.min(v, ri[i]) - 2); break; }
      }
      ri2[i] = v;
    }
    const col = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) if (rid[i] >= 0) col[i] = this.ramps[rid[i]][ri2[i]];
    // specular glints on hard, glossy and wet things: the top-left-most lit interior pixel of each glossy part
    // (two pixels on big ones), in the palette's lightest step
    if (this.gloss.size) {
      const best = new Map<number, [number, number]>(), cnt = new Map<number, number>();
      for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x, a = part[i]; if (rid[i] < 0 || !this.gloss.has(a)) continue;
        cnt.set(a, (cnt.get(a) ?? 0) + 1);
        const len = this.ramps[rid[i]].length;
        if (ri2[i] < Math.ceil((len - 1) * 0.5) || part[i - 1] !== a || part[i + 1] !== a || part[i - W] !== a || part[i + W] !== a || rid[i - 1] < 0 || rid[i - W] < 0) continue;
        const sc = x * 0.8 + y, b = best.get(a); if (!b || sc < b[0]) best.set(a, [sc, i]);
      }
      for (const [a, [, i]] of best) {
        const n = cnt.get(a) ?? 0; if (n < 6) continue;
        const R = this.ramps[rid[i]], top = R[R.length - 1], g = luma(top) > 165 ? top : SN[5];
        col[i] = g; if (n >= 40 && part[i + 1] === a) col[i + 1] = g;
      }
    }
    // the outline: 1 px all round every silhouette, the darkest step of the object's own ramp (ink for pale ones)
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (rid[i] >= 0) continue;
      let hit = -1;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { if (solid(x + dx, y + dy)) { hit = (y + dy) * W + x + dx; break; } }
      if (hit < 0) continue;
      const R = this.ramps[rid[hit]], d = R[0];
      col[i] = R.length > 2 ? (luma(d) > 64 ? INK[1] : d) : OUT;
    }
    // fx under the solids (shows only where nothing solid or outlined is), fx over everything
    for (let i = 0; i < n; i++) if (col[i] < 0 && this.fxu[i] >= 0) col[i] = this.fxu[i];
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
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const c = col2[y * W + x]; if (c >= 0) pc.set(x, y, o.dim ? dimC(c) : c); }
    if (o.shadow) {
      const a = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < W && col2[y * W + x] >= 0;
      for (let y = W - 1; y >= 1; y--) for (let x = W - 1; x >= 1; x--) if (!a(x, y) && a(x - 1, y - 1)) pc.set(x, y, OUT, 110);
    }
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
    p.ball(ex, ey, 0.78 * s, 0.78 * s, BR, { gain: k, n: 5 });
    p.rock(ex + d2[0] * L2 * 0.45, ey + d2[1] * L2 * 0.45, 1.3 * s, 41 + (back ? 7 : 0), RK, { gain: k, sq: 0.9 });
    const fr = 1.75 * s * (g.fist ?? 1);
    if (g.open && !back) {
      for (let i = -1; i <= 1; i++) { const a = ang[0] + ang[1] + i * 0.45, dd = dir(a); p.rock(wx + dd[0] * 1.6 * s, wy + dd[1] * 1.6 * s, 0.75 * s, 61 + i, RW, { gain: k }); }
      p.rock(wx + d2[0] * 0.3 * s, wy + d2[1] * 0.3 * s, 1.2 * s, 51, RW, { gain: k });
    } else {
      const fx = wx + d2[0] * 0.55 * s, fy = wy + d2[1] * 0.55 * s, fs = p.rock(fx, fy, fr, 51 + (back ? 7 : 0), RW, { gain: k, sq: 0.92, cracks: 0 });
      if (fr * p.k >= 2.2) p.mark([fx - d2[1] * fr * 0.7 + d2[0] * fr * 0.2, fy + d2[0] * fr * 0.7 + d2[1] * fr * 0.2, fx + d2[0] * fr * 0.7, fy + d2[1] * fr * 0.7], fs.part, 1); // the knuckle seam
    }
    return [wx + d2[0] * (0.55 * s + fr), wy + d2[1] * (0.55 * s + fr)];
  };
  const shF: [number, number] = [x + 4.3 * s * f, y - 2.4 * s], shB: [number, number] = [x - 4.3 * s * f, y - 2.4 * s];
  let tipB: [number, number] | null = null, tipF: [number, number] | null = null;
  const body = g.body !== false;
  if (body && g.back) tipB = arm(shB[0], shB[1], g.back, true);
  if (body && g.coil !== false) {
    p.ball(x, y + 6.4 * s, 2.0 * s, 1.0 * s, VI, { amb: 0.1, n: 6 });
    for (let i = 0; i < 3; i++) p.ring(x, y + 4.6 * s + i * 1.05 * s, (2.1 - i * 0.35) * s, (3.0 - i * 0.45) * s, CU, { ry: 0.38, gain, n: 8 });
  }
  if (body) {
    p.rock(x, y, 4.7 * s, 21, RK, { sq: 0.94, gain, jag: 0.16 });
    const px = x + 0.6 * s * f, py = y + 0.2 * s;
    p.box(px - 2.4 * s, py - 2.2 * s, 4.8 * s, 4.6 * s, OL, { gain, bevel: 0.45 * s });
    if (s > 0.7) for (const [rx, ry] of [[-1.85, -1.65], [1.85, -1.65], [-1.85, 1.85], [1.85, 1.85]]) p.rivet(px + rx * s, py + ry * s, 0.38 * s);
    p.ring(px, py + 0.1 * s, 0.75 * s, 1.4 * s, BR, { gain, n: 7 });
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
    p.ball(x - 2.2 * s * f, y - 4.6 * s, 0.5 * s, 0.5 * s, RE, { n: 5 });
  }
  const rk = p.rock(x, y, 3.4 * s, 11, RK, { sq: 0.9, jag: 0.18, cracks: 0 });
  if (s >= 1.6) { // a glowing fissure and a crack across the skull
    p.clip = rk.inside;
    p.fline(x - 2.6 * s * f, y - 0.6 * s, x - 1.4 * s * f, y + 0.4 * s, LN[2]); p.fline(x - 1.4 * s * f, y + 0.4 * s, x - 1.8 * s * f, y + 1.4 * s, LN[2]);
    p.clip = null;
    p.mark([x - 0.4 * s * f, y - 3.2 * s, x + 0.1 * s * f, y - 2.2 * s, x - 0.1 * s * f, y - 1.5 * s], rk.part, 1);
  }
  p.poly([x - 2.9 * s, y + 1.3 * s, x + 2.9 * s, y + 1.3 * s, x + 2.4 * s, y + 2.7 * s, x - 2.4 * s, y + 2.7 * s], OL, (_, yy) => (yy < y + 1.75 * s ? P_LIT : P_MID));
  if (s >= 1.2) for (let i = -2; i <= 2; i++) p.rivet(x + i * 1.1 * s + (i === 1 ? 0.15 * s : 0), y + 2.0 * s, 0.3 * s);
  const lx = x + 1.3 * s * f, ly = y - 0.4 * s;
  p.ring(lx, ly, 0.95 * s, 1.75 * s, BR, { n: 8 });
  p.ball(lx, ly, 1.0 * s, 1.0 * s, GL, { gain: 0.5, n: 6 });
  p.glow(lx, ly, 1.05 * s, o.glow ?? LN);
  return [lx, ly];
}
/** a quadruped beast in profile */
function beast(p: IP, x: number, y: number, s: number, f: number, ramp: Ramp = FL, o: { eye?: Ramp; spines?: boolean; tuck?: number } = {}) {
  const k = o.tuck ?? 0;
  p.seg(x - 3.6 * s * f, y - 0.4 * s, x - 6.4 * s * f, y - 2.2 * s - k * 2 * s, 1.0 * s, ramp, { gain: 0.85 });
  p.seg(x - 2.4 * s * f, y + 0.8 * s, x - 2.9 * s * f - k * 2 * s * f, y + 4.0 * s - k * 2.5 * s, 1.15 * s, ramp, { gain: 0.7 });
  p.seg(x + 1.8 * s * f, y + 0.8 * s, x + 1.5 * s * f + k * 2 * s * f, y + 4.0 * s - k * 2.5 * s, 1.15 * s, ramp, { gain: 0.7 });
  p.ball(x, y, 4.3 * s, 2.5 * s, ramp, { n: 8, seed: 5 });
  p.seg(x - 1.6 * s * f, y + 1.2 * s, x - 1.3 * s * f - k * 2 * s * f, y + 4.2 * s - k * 2.5 * s, 1.2 * s, ramp);
  p.seg(x + 2.8 * s * f, y + 1.0 * s, x + 3.0 * s * f + k * 2 * s * f, y + 4.2 * s - k * 2.5 * s, 1.2 * s, ramp);
  if (o.spines !== false) for (let i = -1; i <= 1; i++) { const sx = x + i * 1.6 * s * f, hh = 1.6 + i * 0.25; p.poly([sx - 0.7 * s, y - 2.0 * s, sx + 0.7 * s, y - 2.0 * s, sx - 0.3 * s * f, y - (2.0 + hh) * s], BN, P_TOP); }
  p.ball(x + 4.6 * s * f, y - 1.3 * s, 2.2 * s, 1.75 * s, ramp, { n: 7, seed: 9 });
  p.ball(x + 6.4 * s * f, y - 0.6 * s, 1.3 * s, 0.9 * s, ramp, { gain: 0.95, n: 6, seed: 13 });
  for (let i = 0; i < 2; i++) p.poly([x + (5.8 + i * 0.8) * s * f, y + 0.1 * s, x + (6.3 + i * 0.8) * s * f, y + 0.1 * s, x + (6.05 + i * 0.8) * s * f, y + (0.9 - i * 0.2) * s], BN, P_TOP);
  const ex = x + 5.0 * s * f, ey = y - 1.9 * s;
  if (o.eye) p.glow(ex, ey, 0.75 * s, o.eye); else p.disc(ex, ey, 0.42 * s, FI[3]);
  return { eye: [ex, ey] as [number, number], top: [x + 4.4 * s * f, y - 3.1 * s] as [number, number] };
}
/** a leafy plant; veyr: grafted (teal, glowing veins, a lit bud) */
function plant(p: IP, x: number, y: number, s: number, o: { veyr?: boolean } = {}) {
  const R = o.veyr ? VE : PL;
  p.seg(x, y, x - 0.4 * s, y - 13 * s, 1.3 * s, R, { gain: 0.85 });
  const leaves: [number, number, number, number, number][] = [[-4.2, -7.5, 3.8, 1.6, -0.55], [4.0, -10.4, 3.8, 1.5, 0.6], [-3.6, -2.6, 3.3, 1.4, -0.3], [3.6, -4.6, 3.1, 1.3, 0.45]];
  for (const [dx, dy, rx, ry, rot] of leaves) {
    const ux = Math.cos(rot), uy = Math.sin(rot), sg = dx < 0 ? 1 : -1, cx = x + dx * s, cy = y + dy * s;
    const bx = cx + ux * rx * s * sg, by = cy + uy * rx * s * sg, tx = cx - ux * rx * s * sg, ty = cy - uy * rx * s * sg;
    const lf = p.leaf(bx, by, tx, ty, ry * 2.1 * s, R, { bend: dx < 0 ? -0.12 : 0.12, vein: !o.veyr });
    if (o.veyr) { p.clip = lf.inside; p.fline(bx, by, bx + (tx - bx) * 0.8, by + (ty - by) * 0.8, LN[3]); p.clip = null; }
  }
  if (o.veyr) { p.ball(x - 0.4 * s, y - 14 * s, 1.6 * s, 1.6 * s, VE, { amb: 0.15, n: 6 }); p.glow(x - 0.4 * s, y - 14 * s, 1.1 * s, LN); }
}
/** a double helix between two points (two ramps; rungs in bone) */
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
  const L = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * spread, l = len * (0.6 + h1(i, 5) * 0.4);
    p.fline(x + nx * o - ux * 1.2, y + ny * o - uy * 1.2, x + nx * o - ux * (1.2 + l), y + ny * o - uy * (1.2 + l), c);
  }
}
function impact(p: IP, x: number, y: number, s: number) {
  p.glow(x, y, s * 1.1, FI);
  p.spark(x, y, s * 1.6, FI[3]);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3 + (h1(i, 7) - 0.5) * 0.5, r0 = s * 1.3, r1 = s * (2.0 + h1(i, 2) * 0.8); p.fline(x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1, FI[4]); }
}
/** a slab of ground; grass: blade clumps drawn along the edge */
function ground(p: IP, y: number, ramp: Ramp = SO, grass = false) {
  p.box(-1, y, 34, 34 - y, ramp, { bevel: 1.0, lum: 0.5 });
  if (grass) for (let x = 0.6, i = 0; x < 32; x += 2.4 + h1(i, 2) * 1.8, i++) {
    const hh = 1.1 + h1(i, 1) * 1.3;
    p.fline(x, y, x - 0.5, y - hh, PL[4]); p.fline(x + 0.8, y, x + 1.2, y - hh * 0.7, PL[3]);
    if (i % 3 === 1) p.fline(x + 0.3, y, x + 0.1, y - hh * 1.3, PL[5]);
  }
}
/** a five-point star */
function star(cx: number, cy: number, R: number, r: number, rot = -Math.PI / 2): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) { const a = rot + (i / 10) * TAU, rr = i % 2 ? r : R; pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  return pts;
}


// ---- the works: machines, belts, domes, cards
/** a polyline (closed: back to the start) of fx strokes */
function lines(p: IP, pts: number[], c: number, closed = false, w = 0, dash = 0) {
  for (let i = 0; i + 3 < pts.length; i += 2) p.fline(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], c, w, -1, dash);
  if (closed) p.fline(pts[pts.length - 2], pts[pts.length - 1], pts[0], pts[1], c, w, -1, dash);
}
/** an N-gon's corners (an angular stand-in for a circle drawn as lines) */
function corners(cx: number, cy: number, r: number, n = 8, rot = 0.2, ry = 1) { const q: number[] = []; for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; q.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r * ry); } return q; }
/** a dome's outline, base to base over the top, in n straight panes */
function dome(cx: number, by: number, rx: number, ry: number, n = 7) { const q: number[] = []; for (let i = 0; i <= n; i++) { const a = Math.PI + (i / n) * Math.PI; q.push(cx + Math.cos(a) * rx, by + Math.sin(a) * ry); } return q; }
/** a dome's meridians at fractions f of its half width, as straight strokes */
function meridians(p: IP, cx: number, by: number, rx: number, ry: number, fs: number[], c: number, dash = 0) {
  for (const f of fs) { const q: number[] = []; for (const a of [0, 0.45, 0.9, 1.25, Math.PI / 2]) q.push(cx + rx * f * Math.cos(a), by - ry * Math.sin(a)); lines(p, q, c, false, 0, dash); }
}
/** a cog: teeth cut into the outline, the rim bevelled, a hexagonal bore */
function cog(p: IP, cx: number, cy: number, r: number, ramp: Ramp, teeth = 8, rot = 0.2) {
  const pts: number[] = [], s = Math.PI / teeth;
  for (let i = 0; i < teeth; i++) { const a = (i / teeth) * TAU + rot; for (const [da, rr] of [[-s * 0.95, r * 0.78], [-s * 0.5, r], [s * 0.5, r], [s * 0.95, r * 0.78]]) pts.push(cx + Math.cos(a + da) * rr, cy + Math.sin(a + da) * rr); }
  const hole = ngon(cx, cy, r * 0.3, 1, 6, rot);
  return p.bevel(pts, ramp, { w: Math.max(0.7, r * 0.22), lum: P_TOP, clip: (x, y) => !hole(x, y) });
}
/** an enamel mark plate with the model's numeral (I, II, III) struck in */
function mkPlate(p: IP, x: number, y: number, mk: number) {
  const pl = p.box(x, y, 1 + mk * 1.1, 3, CR, { bevel: 0.3, lum: 0.62 });
  for (let i = 0; i < mk; i++) p.mark([x + 0.85 + i * 1.1, y + 0.7, x + 0.85 + i * 1.1, y + 2.3], pl.part, 0);
}
/** a lattice derrick over a seam: mk 1-3 (heavier legs, more bracing, its plate) */
function derrick(p: IP, x: number, gy: number, top: number, mk: number) {
  const w = 3 + mk * 0.7, lw = 0.8 + mk * 0.2, n = 2 + mk;
  p.seg(x, top, x, gy + 2 + mk, 0.8 + mk * 0.3, GM, { gain: 0.85 });
  p.seg(x - w, gy, x - 1.1, top, lw, GM); p.seg(x + w, gy, x + 1.1, top, lw, GM, { gain: 0.8 });
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, ya = gy + (top - gy) * t0, yb = gy + (top - gy) * t1, xa = w + (1.1 - w) * t0, xb = w + (1.1 - w) * t1, sg = i % 2 ? 1 : -1;
    p.fline(x - xa * sg, ya, x + xb * sg, yb, GM[2]); p.fline(x - xb, yb, x + xb, yb, GM[3]);
  }
  const hw = 2.4 + mk * 0.4;
  p.box(x - hw, top - 3.6, hw * 2, 4.2, OL, { bevel: 0.6 });
  mkPlate(p, x - (1 + mk * 1.1) / 2, top - 3.0, mk);
}
/** a conveyor: a rubber band (lit top face, shaded edge) on a steel rail, roller seams, crates riding it */
function belt(p: IP, x0: number, y0: number, x1: number, y1: number, w: number, crates: number) {
  const yAt = (x: number) => y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1e-6);
  const b = p.poly([x0, y0, x1, y1, x1, y1 + w, x0, y0 + w], BK, (x, y) => (y - yAt(x) < w * 0.4 ? P_TOP : P_SH));
  p.seg(x0, y0 + w + 0.3, x1, y1 + w + 0.3, 0.5, GM, { gain: 0.8 });
  const n = Math.max(2, Math.round(Math.abs(x1 - x0) / 2.6));
  for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n; p.mark([x, yAt(x) + w * 0.5, x, yAt(x) + w], b.part, 0); }
  for (let i = 0; i < crates; i++) { const t = (i + 0.6) / (crates + 0.2), x = x0 + (x1 - x0) * t, y = yAt(x); p.box(x - 0.9, y - 1.9, 1.8 + (i % 2) * 0.4, 1.9, i % 2 ? OR : BR, { bevel: 0.3 }); }
  return b;
}
/** a crystal: two side faces and two cap facets, one ramp step each */
function crystal(p: IP, cx: number, by: number, w: number, h: number, lean: number, ramp: Ramp, g = 1) {
  const BL = [cx - w, by], BM = [cx + w * 0.15, by + w * 0.5], BRt = [cx + w, by - w * 0.25];
  const TL = [cx - w + lean, by - h], TM = [cx + w * 0.15 + lean, by - h + w * 0.5], TR = [cx + w + lean, by - h - w * 0.25], A = [cx + lean * 1.4 + w * 0.1, by - h - w * 2.1];
  const part = ++p.pid;
  p.poly([...BL, ...BM, ...TM, ...TL], ramp, P_MID * g, { part }); p.poly([...BM, ...BRt, ...TR, ...TM], ramp, P_SH * g, { part });
  p.poly([...TL, ...TM, ...A], ramp, P_LIT * g, { part }); p.poly([...TM, ...TR, ...A], ramp, P_TOP * g, { part });
}
/** the fallback: a blueprint card with its branch's glyph drawn in white line (any skill without its own vignette) */
function card(p: IP, branch: string) {
  const sh = p.bevel([4, 4.5, 24.5, 3.6, 28.2, 7.2, 28.6, 28, 5, 28.6], GL, { w: 1.1, lum: P_MID });
  p.poly([24.5, 3.6, 24.9, 7.4, 28.2, 7.2], GL, P_LIT, { part: sh.part });
  p.clip = sh.inside; for (let x = 8; x < 29; x += 4) p.fline(x, 3, x, 29, GL[3], 0, -1, 1); for (let y = 8; y < 29; y += 4) p.fline(3, y, 29, y, GL[3], 0, -1, 1); p.clip = null;
  const c = CR[4];
  switch (branch) {
    case 'chassis': lines(p, [11, 14, 12, 10, 16, 8.5, 20, 10, 21, 14, 19.5, 17.5, 12.5, 17.5], c, true); lines(p, corners(17.8, 12.8, 2, 8), c, true); lines(p, [12, 19.6, 20, 19.6], c); break;
    case 'harvest': lines(p, [12, 21.5, 15, 10], c); lines(p, [20, 21.5, 17, 10], c); lines(p, [13, 17.4, 19, 17.4], c); lines(p, [13.9, 13.6, 18.1, 13.6], c); lines(p, [13.4, 7, 18.6, 7, 18.6, 10, 13.4, 10], c, true); lines(p, [16, 21.5, 16, 23.4], c); break;
    case 'gravity': for (let i = 0; i < 3; i++) { const y = 8.5 + i * 4.2; lines(p, [10.5, y, 16, y + 3.4, 21.5, y], i === 2 ? CR[5] : c); } break;
    case 'combat': lines(p, [11, 11, 19, 10, 21.5, 12.5, 21.5, 18, 19, 20.5, 12, 20.5, 10.5, 18], c, true); for (const x of [13.2, 15.9, 18.6]) lines(p, [x, 10.8, x, 14], c); lines(p, [11, 16, 15, 16], c); break;
    case 'fabrication': { const q: number[] = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2, s = Math.PI / 8; for (const [da, rr] of [[-s * 0.9, 4.4], [-s * 0.45, 6], [s * 0.45, 6], [s * 0.9, 4.4]]) q.push(16 + Math.cos(a + da) * rr, 14.5 + Math.sin(a + da) * rr); } lines(p, q, c, true); lines(p, corners(16, 14.5, 1.8, 6), c, true); break; }
    case 'lab': lines(p, [14, 8, 18, 8, 18, 12, 22, 21, 10, 21, 14, 12], c, true); lines(p, [12.4, 17.6, 19.6, 17.6], c); p.fdot(15, 19.2, 0.5, LN[3]); p.fdot(17.4, 18.8, 0.4, LN[3]); break;
    default: lines(p, [12.6, 11.2, 14, 8.6, 18, 8.6, 19.6, 11.2, 19.6, 12.8, 16, 15.2, 16, 17.6], c); p.fdot(16, 20.6, 0.7, c);
  }
  lines(p, [7, 25.2, 17.5, 25.2], CR[2]); lines(p, [7, 26.8, 12.5, 26.8], CR[2]);
}

// ------------------------------------------------------------------ the set
type Art = (p: IP) => void;
const ART: Record<string, Art> = {
  // ---------------- resources
  ore(p) {
    const big = p.rock(15, 16.5, 11.5, 3, RD_ROCK, { sq: 0.84, n: 9, jag: 0.2 });
    p.clip = big.inside;
    p.seg(5, 13, 13, 18, 1.6, CU, { gain: 0.8 }); p.seg(13, 18, 21, 14, 1.4, CU, { gain: 0.8 }); p.seg(15, 21, 24, 23, 1.2, CU, { gain: 0.8 }); p.seg(9, 8, 14, 11, 1.0, CU, { gain: 0.8 });
    p.rock(19, 11.5, 2.9, 71, OR); p.rock(10.5, 19.5, 2.4, 72, OR); p.rock(21.5, 19.5, 2.0, 73, OR); p.rock(13.5, 9.5, 1.4, 74, OR);
    p.clip = null;
    p.rock(26.5, 26.5, 3.8, 8, RD_ROCK, { sq: 0.85 }); p.rock(27, 25.6, 1.5, 75, OR);
    p.spark(18.2, 10.4, 2.2, OR[6]); p.spark(9.8, 18.8, 1.4, OR[6]);
  },
  carbon(p) {
    const crystal = (cx: number, by: number, w: number, h: number, lean: number, g = 1) => {
      const BL = [cx - w, by], BM = [cx + w * 0.15, by + w * 0.5], BRt = [cx + w, by - w * 0.25];
      const TL = [cx - w + lean, by - h], TM = [cx + w * 0.15 + lean, by - h + w * 0.5], TR = [cx + w + lean, by - h - w * 0.25], A = [cx + lean * 1.4 + w * 0.1, by - h - w * 2.1];
      const part = ++p.pid;
      p.poly([...BL, ...BM, ...TM, ...TL], CB, P_MID * g, { part });
      p.poly([...BM, ...BRt, ...TR, ...TM], CB, P_SH * g, { part });
      p.poly([...TL, ...TM, ...A], CB, P_LIT * g, { part });
      p.poly([...TM, ...TR, ...A], CB, P_TOP * g, { part });
    };
    p.rock(16, 27, 7, 4, RD_ROCK, { sq: 0.45 });
    crystal(9, 26, 2.6, 7, -1.5, 0.85);
    crystal(21.5, 25.5, 2.4, 6, 1.8, 0.9);
    crystal(15, 26.5, 3.6, 13, 0.4);
    p.rock(6, 28.5, 2.2, 9, RD_ROCK); p.rock(25.5, 28.6, 2.0, 12, RD_ROCK);
    p.spark(16.7, 7.5, 2.0, CB[6]); p.fdot(23.5, 15.2, 0.45, CB[6]); p.fdot(12, 28.4, 0.6, FI[2]); p.fdot(20, 28.8, 0.4, FI[1]);
  },
  water(p) {
    const d = p.gem([16, 2.4, 18.8, 7.2, 22.8, 13.2, 24.8, 18.2, 24.4, 22.6, 21.8, 26.6, 17.6, 28.8, 13.4, 28.6, 9.8, 26.2, 7.6, 22.2, 7.4, 17.6, 9.6, 12.6, 13.4, 7.0], WA, { crown: 0.3, top: 0.52 });
    p.clip = d.inside;
    p.fline(13.2, 10.4, 11.2, 14.6, WA[6], 0.9); p.fline(10.6, 16.4, 10.2, 18.6, WA[6]); // light on the lit shoulder
    p.fline(20.4, 24.6, 22.4, 21.8, WA[5]);                                          // light thrown back through the water
    p.clip = null;
    p.under = true;
    p.fline(3.5, 29.8, 9.5, 29.8, WA[4]); p.fline(22.5, 29.6, 28.8, 29.6, WA[4]); p.fline(6, 31, 11, 31, WA[3]); p.fline(21, 31, 25.5, 31, WA[3]);
    p.under = false;
    p.fdot(5, 27.2, 0.6, WA[5]); p.fdot(27.4, 26.4, 0.5, WA[5]);
  },
  soil(p) {
    const m = p.gem([2.2, 28.8, 3.8, 24.4, 7.6, 20.2, 12.6, 17.8, 18.4, 17.4, 23.4, 18.8, 27.4, 22.4, 29.8, 28.8], SO, { crown: 0.15, top: 0.45 });
    p.mark([6, 26.5, 9, 25.4, 10.4, 27], m.part, 2); p.mark([19.5, 27.8, 22.5, 26.2, 25.4, 27.4], m.part, 2); p.mark([12, 22.6, 14.4, 22], m.part, 2);
    p.ball(11.5, 21, 2.2, 1.6, SO, { n: 5 }); p.ball(21, 24.5, 2.5, 1.7, SO, { n: 6 }); p.ball(16.5, 25.5, 1.4, 1.0, SO, { n: 5 });
    p.rock(7.5, 25.5, 1.6, 2, RK); p.rock(24.5, 21, 1.3, 5, RK); p.rock(14, 27.6, 1.0, 9, RK);
    p.seg(17, 18, 17.6, 11, 0.8, PL);
    p.leaf(17.4, 12.4, 12.2, 10.4, 2.2, PL, { bend: -0.14 }); p.leaf(17.6, 11.6, 22.8, 9.2, 2.0, PL, { bend: 0.12 });
  },
  // ---------------- status
  hull(p) {
    const outer = p.bevel([5, 4, 27, 4, 27, 15, 24.5, 22, 16, 29, 7.5, 22, 5, 15], GM, { w: 2.4, lum: P_MID });
    p.bevel([8, 7, 24, 7, 24, 14.5, 22, 20, 16, 25.5, 10, 20, 8, 14.5], OL, { w: 1.2, lum: P_MID });
    p.bevel(star(16, 14.5, 5.2, 2.1), CR, { w: 0.9, lum: P_TOP });
    for (const [x, y] of [[7, 6], [16, 6], [25, 6], [6.8, 14.5], [25.2, 14.5], [10.5, 22.5], [21.5, 22.5]]) p.rivet(x, y, 0.65, GM);
    p.clip = outer.inside; p.fline(23, 4.5, 21, 8, OUT); p.fline(21, 8, 22.5, 10.5, OUT); p.clip = null;
  },
  cell(p) {
    p.box(14, 1.5, 4, 2.6, BR, { bevel: 0.6 });
    p.box(9.5, 3.8, 13, 3.6, BR, { bevel: 0.8 });
    const g = p.tank(10.5, 6.8, 11, 18.4, GL, { r: 3, gain: 0.85 });
    p.clip = g.inside; p.glow(16, 16, 4.3, LN, { ry: 1.9 }); p.fline(16, 10, 16, 22, LN[4]); p.fline(12.6, 9, 12.6, 21, GL[5], 0, -1, 2.5); p.clip = null;
    p.box(9.5, 24.4, 13, 3.6, BR, { bevel: 0.8 });
    p.seg(13, 28, 13, 30.5, 1.1, GM); p.seg(19, 28, 19, 30.5, 1.1, GM);
    p.spark(24, 6.5, 2, LN[3]);
  },
  charge(p) {
    p.under = true;
    for (const [a, b, c, d] of [[5, 6, 7.5, 8.4], [27, 4.6, 24.8, 7.2], [3.6, 21, 6.6, 19.8], [28.4, 19.4, 25.4, 18.6], [8.4, 28.6, 10.2, 25.8], [23.6, 27.6, 21.4, 25.2]]) p.fline(a, b, c, d, VI[3]);
    p.under = false;
    p.bevel([19.5, 1.5, 8.5, 17, 15, 17, 11, 30.5, 24.5, 12.5, 17.5, 12.5, 22.5, 1.5], VI, { w: 1.7, lum: P_TOP, amb: 0.12 });
    p.spark(26, 23.5, 2, VI[5]); p.spark(6.5, 9, 1.6, VI[5]);
  },
  skills(p) {
    const tr = (a: number[], b: number[]) => p.seg(a[0], a[1], b[0], b[1], 1.3, CU);
    const R = [16, 27.5], A = [16, 19], B = [8, 13], C = [24, 13], D = [8, 5.5], E = [24, 5.5], F = [16, 9];
    tr(R, A); tr(A, B); tr(A, C); tr(B, D); tr(C, E); tr(A, F);
    const node = (c: number[], r: number, g: Ramp | null) => { p.ring(c[0], c[1], r * 0.55, r, BR, { n: 7 }); if (g) p.glow(c[0], c[1], r * 0.62, g); else p.disc(c[0], c[1], r * 0.58, GM[1]); };
    node(R, 3.4, LN); node(A, 2.4, LN); node(B, 2.4, LN); node(C, 2.4, FI); node(F, 2.1, null); node(D, 2.1, null); node(E, 2.1, LN);
  },
  menu(p) {
    const pts: number[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2 + (h1(i, 4) - 0.5) * 0.05;
      for (const [da, r] of [[-0.36, 10.2], [-0.19, 13.4], [0.19, 13.4], [0.36, 10.2]]) pts.push(16 + Math.cos(a + da) * r, 16 + Math.sin(a + da) * r);
    }
    const hole = ngon(16, 16, 3.8, 1, 8, 0.2);
    p.bevel(pts, BR, { w: 2.2, lum: P_TOP, clip: (x, y) => !hole(x, y) });
    p.ring(16, 16, 3.6, 6.4, OL, { n: 8, rot: 0.2 });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.6; p.rivet(16 + Math.cos(a) * 8.4, 16 + Math.sin(a) * 8.4, 0.6, GM); }
  },
  // ---------------- chassis
  head(p) {
    p.under = true; p.plate(15.5, 29.2, 8, 2.2, VI[1], VI[2]); p.under = false;
    head(p, 15, 15, 2.95, 1);
    p.rock(4.5, 25.5, 1.1, 3, RK); p.rock(27, 23, 1.3, 6, RK); p.rock(25.5, 28.5, 0.8, 8, RK);
    p.fline(4.5, 27.5, 4.5, 29.5, VI[3]); p.fline(27, 25.4, 27, 27.6, VI[3]);
  },
  torso(p) {
    p.ball(4.2, 12, 2.4, 2.4, GM, { n: 6 }); p.ball(27.8, 12, 2.4, 2.4, GM, { n: 6 });
    p.box(12.5, 2.5, 7, 3.2, GM, { bevel: 0.7 });
    p.ring(16, 27.5, 3.2, 5.6, CU, { ry: 0.38 });
    p.rock(16, 16.5, 12.4, 21, RK, { sq: 0.86, jag: 0.14 });
    p.box(8.5, 9.5, 15, 13.5, OL, { bevel: 1.1 });
    for (const [x, y] of [[10, 11], [22, 11], [10, 21.5], [22, 21.5], [16, 10.6]]) p.rivet(x, y, 0.7);
    p.ring(16, 16.5, 2.8, 4.7, BR, { n: 8 });
    p.glow(16, 16.5, 2.95, LN);
  },
  armR(p) {
    p.ball(6, 6.5, 3.2, 3.2, GM, { n: 7 });
    p.seg(5, 8.5, 14, 16.5, 1.3, GM); p.seg(7.5, 5.5, 16, 13.5, 1.0, GM);
    p.farc(9.5, 13.5, 5, -1.9, -0.4, CU[5], 0.8);
    p.rock(10.3, 10.8, 3.5, 31, RK, { sq: 0.85 });
    p.ball(15.8, 15.6, 2.0, 2.0, BR, { n: 6 });
    p.seg(15.5, 15.5, 22.5, 22.5, 1.2, GM);
    p.rock(19.3, 19.5, 3.2, 41, RK, { sq: 0.86 });
    const fist = p.rock(24.8, 25.2, 4.8, 51, RW, { sq: 0.88, cracks: 0 });
    p.mark([22, 23, 25.5, 28.5], fist.part, 1); p.mark([24.5, 21.5, 28, 26.5], fist.part, 1);
  },
  armL(p) {
    const m = (x: number) => 32 - x;
    p.ball(m(6), 6.5, 3.2, 3.2, GM, { n: 7 });
    p.seg(m(5), 8.5, m(14), 16.5, 1.3, GM); p.seg(m(7.5), 5.5, m(16), 13.5, 1.0, GM);
    p.rock(m(10.3), 10.8, 3.5, 37, RK, { sq: 0.85 });
    p.ball(m(15.8), 15.6, 2.0, 2.0, BR, { n: 6 });
    p.seg(m(15.5), 15.5, m(21.5), 21.5, 1.2, GM);
    p.rock(m(19.3), 19.5, 3.2, 47, RK, { sq: 0.86 });
    p.rock(m(23), 23.5, 3.0, 57, RW, { cracks: 0 });
    for (const [dx, dy, r] of [[3.4, 0.2, 1.3], [2.6, 2.6, 1.3], [0.2, 3.4, 1.25]]) p.rock(m(23 + dx), 23.5 + dy, r, 70 + dx, RW);
    p.glow(m(26.5), 27.2, 1.4, LN);
  },
  coil(p) {
    p.ball(16, 15.5, 4.2, 9.5, VI, { amb: 0.12, n: 8 });
    for (let i = 0; i < 4; i++) p.ring(16, 7.8 + i * 4.6, 6.6 - i * 0.5, 9.2 - i * 0.6, CU, { ry: 0.36 });
    p.under = true; p.farc(16, 16, 14.5, 0, TAU, VI[3], 0, 0.42, -1, 1); p.plate(16, 30.8, 4.5, 1.3, VI[2], VI[3]); p.under = false;
    p.rock(3.2, 19.5, 1.7, 3, RK); p.rock(28.6, 13.2, 1.5, 7, RK); p.rock(25.8, 23.5, 1.1, 9, RK);
  },
  plating1(p) {
    const pl = p.box(5, 5, 22, 22, GM, { bevel: 1.4, lum: 0.6, r: 1.5 });
    p.clip = pl.inside; for (const [a, b, c, d] of [[9, 25, 20, 8.4], [11.4, 24.4, 23, 7], [15, 25, 21.6, 14.8]]) p.fline(a, b, c, d, GM[5]); p.clip = null;
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
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + 0.13 + (h1(i, 3) - 0.5) * 0.12, r0 = 11.5, r1 = (i % 2 ? 14 : 15.5) - h1(i, 5) * 0.8;
      p.fline(16 + Math.cos(a) * r0, 16 + Math.sin(a) * r0, 16 + Math.cos(a) * r1, 16 + Math.sin(a) * r1, i % 2 ? LN[1] : LN[2]);
    }
    p.ring(16, 16, 6.6, 10.6, BR, { n: 10 });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.39; p.rivet(16 + Math.cos(a) * 8.6, 16 + Math.sin(a) * 8.6, 0.65, GM); }
    p.glow(16, 16, 6.8, LN);
    p.spark(15, 15, 3.6, LN[3]);
  },
  // ---------------- harvest
  drill(p) {
    p.rock(25, 28, 7.5, 5, RD_ROCK, { sq: 0.7 });
    p.rock(27, 26, 1.7, 76, OR); p.rock(21.5, 28, 1.2, 77, OR);
    head(p, 8, 8.5, 1.75, 1);
    p.seg(11, 12, 15.5, 16.5, 1.5, GM);
    p.bevel([13, 15.5, 17, 11.5, 20, 14.5, 16, 18.5], OL, { w: 0.9 });
    const bit = p.bevel([15.6, 17.7, 19.4, 13.9, 27, 26.5], GM, { w: 1.3, lum: P_TOP });
    p.clip = bit.inside; for (let i = 0; i < 5; i++) { const t = 0.2 + i * 0.16, x = 17.5 + (27 - 17.5) * t, y = 15.8 + (26.5 - 15.8) * t; p.fline(x - 2.4 * (1 - t), y + 0.6, x + 0.6, y - 2.4 * (1 - t), GM[1]); } p.clip = null;
    p.spark(25.5, 24, 2.6, FI[3]);
    for (const [x, y] of [[21, 20], [23, 19.5], [29, 20], [27.5, 18], [20, 22.5]]) p.fdot(x, y, 0.5, h1(x, y) < 0.5 ? FI[3] : FI[2], FI[0]);
    p.fline(24, 23, 21.5, 19, FI[2]); p.fline(26, 23, 28.5, 18.5, FI[2]);
  },
  intake(p) {
    const tr = p.seg(7, 31, 7.6, 17, 3.2, BW);
    p.mark([7.9, 29.5, 8.1, 24], tr.part, 1); p.mark([6.6, 26.5, 6.8, 21.5], tr.part, 1);
    p.seg(7.4, 21, 3, 16, 1.2, BW); p.seg(7.6, 19, 11.8, 14.5, 1.1, BW); p.seg(7.5, 17.5, 6.5, 12.5, 1.0, BW);
    p.gem([1, 31.5, 3, 29.4, 7, 28.8, 11, 29.6, 12.4, 31.5], SO, { gain: 0.8 });
    head(p, 24, 9.5, 1.85, -1);
    const curve = (t: number): [number, number] => { const a = [9, 16], b = [13, 2], c = [21, 13]; const u = 1 - t; return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]; };
    for (let i = 0; i < 9; i++) { const t = i / 8, [x, y] = curve(t); p.fdot(x + (h1(i, 3) - 0.5) * 1.6, y + (h1(i, 4) - 0.5) * 1.6, 0.35 + t * 0.55, i % 3 ? CB[2] : CB[4], CB[5]); }
    p.fdot(5, 13, 0.5, CB[2], CB[5]); p.fdot(11.5, 11, 0.6, CB[3], CB[5]);
  },
  siphon(p) {
    p.gem([3, 27.4, 6, 24.8, 12, 24, 20, 24.2, 26.4, 25, 29, 27.4, 26.6, 30.2, 19, 31, 12, 30.8, 5.4, 30], WA, { crown: 0.1, top: 0.6 });
    for (const [a, b, c, w] of [[7.6, 26.6, 11.6, WA[5]], [19.6, 26.2, 24, WA[5]], [11, 28.6, 14, WA[6]], [18, 28.9, 22.4, WA[4]], [5.6, 28.8, 7.6, WA[4]]]) p.fline(a, b, c, b, w);
    for (let i = 0; i < 26; i++) { const t = i / 25, y = 26 - t * 13, x = 16 + Math.sin(t * 11) * 3.6 * (1 - t * 0.5), r = 0.55 + (1 - t) * 0.25; p.fdot(x, y, r, Math.cos(t * 11) > 0 ? WA[5] : WA[3], WA[1]); }
    head(p, 16, 8.2, 1.9, 1);
    p.fdot(9, 19, 0.5, WA[4], WA[1]); p.fdot(23.5, 17, 0.55, WA[5], WA[1]);
  },
  excavate(p) {
    ground(p, 23, SO, true);
    p.gem([6.5, 23.6, 9, 22.6, 17, 22.6, 19.5, 23.6, 17.5, 26.4, 9, 26.6], SO, { gain: 0.35 });
    golem(p, { x: 26, y: 12, s: 0.95, f: -1, front: [1.0, 0.9], back: [0.4, 0.2] });
    p.ball(10.5, 15.3, 2.8, 1.8, SO, { n: 6 });
    for (const [x, y, r] of [[6, 11, 0.9], [9, 8.5, 0.8], [4, 16, 0.7], [13.5, 10, 0.6]]) p.rock(x, y, r, x * 3, SO);
    p.fline(5.5, 13, 7, 14.5, SO[4]); p.fline(9.5, 10.5, 10, 12.5, SO[4]);
  },
  magnet(p) {
    p.under = true; for (const r of [8.5, 12, 15.5]) p.farc(9, 16, r, -0.9, 0.9, VI[r > 12 ? 2 : 3], 0, 1, -1, 1); p.under = false;
    head(p, 8.5, 16, 1.9, 1);
    for (const [x, y, r, sd] of [[21, 9.5, 1.8, 3], [25.5, 17, 2.1, 5], [21.5, 24.5, 1.6, 7], [29, 11, 1.2, 9]] as [number, number, number, number][]) {
      p.rock(x, y, r, sd, RD_ROCK); p.rock(x + 0.3, y - 0.3, r * 0.55, sd + 50, OR);
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
    p.ring(28, 25.5, 1.4, 2.6, BR, { n: 7 }); p.disc(28, 25.5, 1.4, CR[4]); p.fline(28, 25.5, 29, 24.4, RE[3]);
  },
  // ---------------- gravity
  lift(p) {
    const g = golem(p, { x: 8.5, y: 20.5, s: 0.85, front: [2.65, 0.25], back: [0.35, -0.2] });
    const t = g.tipF!;
    p.under = true; p.plate(22, 15.6, 6.5, 2, VI[1], VI[2]); p.under = false;
    for (let i = 0; i < 6; i++) { const u = i / 5, x = t[0] + (21 - t[0]) * u, y = t[1] + (14.5 - t[1]) * u - Math.sin(u * Math.PI) * 3; p.fdot(x, y, 0.55 - u * 0.15, i % 2 ? VI[4] : VI[3], VI[1]); }
    p.rock(22, 8.5, 6, 13, RW, { sq: 0.85 });
    p.farc(22, 15.8, 5.5, 0, TAU, VI[4], 0, 0.28);
    p.rock(15.5, 4.5, 1.1, 4, RW); p.rock(29, 5, 0.9, 6, RW); p.fdot(19, 18.5, 0.4, RW[3]); p.fdot(25, 19.5, 0.4, RW[3]);
  },
  slam(p) {
    ground(p, 24, RK);
    p.gem([10.5, 24.6, 14, 23.6, 22.5, 23.6, 25.5, 24.6, 22, 26.4, 13.5, 26.4], RK, { gain: 0.35 });
    p.clip = (_, y) => y > 24.2;
    for (const [x1, y1] of [[8, 31], [12, 29], [25, 31], [29, 28], [18, 32]]) p.fline(18, 25, x1, y1, RK[0]);
    p.clip = null;
    for (let i = 0; i < 4; i++) { const y = 2 + i * 5.2, w = 6.5 - i * 0.4, c = i === 3 ? VI[5] : VI[3 + (i % 2)]; p.fline(18 - w, y, 18, y + 3.6, c, 1.1, VI[1]); p.fline(18 + w, y, 18, y + 3.6, c, 1.1, VI[1]); }
    p.plate(18, 23.9, 7.5, 2.2, VI[2], VI[4]);
    for (const [x, y, r] of [[6, 17, 1.5], [29, 18.5, 1.3], [10, 13.5, 0.9], [26, 14, 1.0]]) p.rock(x, y, r, x, RK);
    p.fline(7.5, 19, 9.5, 21.5, RK[5]); p.fline(27.5, 20, 25.5, 22, RK[5]);
  },
  repulse(p) {
    p.under = true; p.farc(16, 18, 12, 0, TAU, VI[3], 1.0, 0.85); p.farc(16, 18, 15.5, 0, TAU, VI[2], 0, 0.85, -1, 1); p.under = false;
    golem(p, { x: 16, y: 18.5, s: 0.82, front: [1.95, 0.35], back: [1.95, 0.35] });
    p.farc(16, 18, 8.4, Math.PI * 1.1, Math.PI * 1.9, VI[5], 0, 1);
    for (const [x, y, dx, dy] of [[3.5, 4, -1, -1], [28.5, 4.5, 1, -1], [3, 29, -1, 1], [29, 28.5, 1, 1]] as [number, number, number, number][]) { p.rock(x, y, 1.6, x + y, RK); streaks(p, x, y, dx, dy, 3.5, 2, 1.2, VI[4]); }
  },
  well(p) {
    for (let arm = 0; arm < 3; arm++) { // three arms of drawn strokes, heavy near the eye, thinning out
      let px = 0, py = 0;
      for (let i = 0; i <= 7; i++) {
        const t = i / 7, r = 3.8 + t * 12.2, a = arm * (TAU / 3) + t * 4.4 + (h1(i + arm * 9, 2) - 0.5) * 0.18;
        const x = 16 + Math.cos(a) * r, y = 16 + Math.sin(a) * r * 0.9;
        if (i) p.fline(px, py, x, y, t < 0.4 ? VI[5] : t < 0.75 ? VI[4] : VI[2], t < 0.45 ? 1.4 : 0);
        px = x; py = y;
      }
    }
    p.ball(16, 16, 4.6, 4.2, VI, { gain: 0.45, n: 8 });
    p.ring(16, 16, 3.4, 4.8, VI, { amb: 0.15, n: 8 });
    p.disc(16, 16, 2.4, INK[0]);
    for (const [r, a, s] of [[9.5, 0.9, 1.4], [12.5, 2.9, 1.7], [7, 4.3, 1.0], [13.5, 5.4, 1.2]]) p.rock(16 + Math.cos(a) * r, 16 + Math.sin(a) * r * 0.9, s, r * 3, RK);
  },
  shape(p) {
    ground(p, 24, SO, true);
    const pil = p.bevel([9, 10, 23, 8.5, 24.5, 25, 7.5, 25], RW, { w: 1.8, lum: P_MID });
    p.clip = pil.inside; for (const y of [13, 17.5, 21.5]) p.fline(6, y, 26, y - 1, RW[1]); p.fline(14, 9, 13, 13, RW[1]); p.fline(19, 17, 20, 21, RW[1]); p.clip = null;
    p.poly([8.6, 10.4, 23.2, 8.8, 23.6, 11, 8.2, 12], PL, P_TOP);
    for (const [x, y, r] of [[6, 25, 1.8], [26, 25.5, 2.0], [4, 27.5, 1.2], [28.5, 28, 1.3]]) p.ball(x, y, r, r * 0.8, SO, { amb: 0.1 });
    for (const [x, y] of [[4, 14], [28, 13]]) for (let i = 0; i < 2; i++) { const yy = y + i * 4; p.fline(x - 2.2, yy + 2, x, yy, LN[3], 0.8, LN[0]); p.fline(x + 2.2, yy + 2, x, yy, LN[3], 0.8, LN[0]); }
  },
  storm(p) {
    ground(p, 27, RK);
    p.farc(16, 27.5, 5.5, 0, TAU, RE[3], 0, 0.3); p.fline(16, 26, 16, 29, RE[3]); p.fline(10.5, 27.5, 21.5, 27.5, RE[2], 0, -1, 1.5);
    const stones: [number, number][] = [];
    for (let i = 0; i < 7; i++) { const a = Math.PI + (i / 6) * Math.PI, x = 16 + Math.cos(a) * 12.5, y = 9 + Math.sin(a) * 5.2 + (h1(i, 4) - 0.5) * 1.2; stones.push([x, y]); }
    p.under = true; for (const [x, y] of stones) p.plate(x, y + 1.8, 1.8, 0.8, VI[1]); p.under = false;
    for (const [x, y] of stones) p.fline(x, y + 1.8, x + (16 - x) * 0.55, y + 1.8 + (26 - y) * 0.55, VI[3], 0, -1, 1.5);
    stones.forEach(([x, y], i) => p.rock(x, y, 1.7 + h1(i, 2) * 0.7, i * 5 + 1, RW));
    p.spark(16, 25.5, 2.4, FI[3]);
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
    p.under = true; p.farc(16, 18, 10, 0, TAU, FI[1], 0, 0.75, -1, 1); p.under = false;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.5 + (h1(i, 6) - 0.5) * 0.3, r = 8.5 + h1(i, 3) * 3, x = 16 + Math.cos(a) * r, y = 18 + Math.sin(a) * r * 0.8;
      p.poly([x - Math.cos(a + 1.3) * 1.6, y - Math.sin(a + 1.3) * 1.6, x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, x - Math.cos(a - 1.3) * 1.4, y - Math.sin(a - 1.3) * 1.4], RW, plane(Math.cos(a), Math.sin(a)));
      streaks(p, x, y, Math.cos(a), Math.sin(a), 2.5, 1, 0, FI[3]);
    }
    impact(p, 16, 18, 3);
  },
  frenzy(p) {
    golem(p, { x: 7.6, y: 20.5, s: 0.95, front: [Math.PI / 2, 0], back: [0.6, -0.5] });
    for (const [x, y, k] of [[21.5, 10, 0.75], [24, 17.5, 1], [21, 25, 0.75]] as [number, number, number][]) {
      streaks(p, x - 1.6, y, 1, (y - 17.5) * 0.06, 5.5, 2, 1.4);
      p.rock(x, y, 2.2, x + y, RW, { gain: k });
      p.spark(x + 4, y, 1.8, FI[3]);
    }
  },
  plow(p) {
    for (let i = 0; i < 4; i++) p.ball(3 + i * 2.6, 27 - i * 0.3, 2.4 - i * 0.3, 1.6, CR, { gain: 0.65, n: 6 });
    streaks(p, 9, 18, 1, 0, 8, 3, 2.2, VI[4]);
    golem(p, { x: 12, y: 18.5, s: 0.82, front: [1.75, -0.1], back: [1.2, 0.2], fist: 1.1 });
    beast(p, 25, 8.5, 0.62, -1, FL, { tuck: 0.6 });
    impact(p, 20.5, 14, 1.8);
  },
  // ---------------- fabrication
  graft(p) {
    p.ball(19.5, 29, 7.5, 2.4, SO, { n: 7 });
    p.under = true; p.farc(19.5, 29, 11, 0, TAU, VE[4], 0, 0.24, -1, 1); p.under = false;
    plant(p, 19.5, 28.5, 1.05, { veyr: true });
    p.rock(5, 18.5, 2.8, 51, RW);
    p.seg(7.5, 18.2, 17.8, 18.8, 0.7, BR);
    p.glow(18.4, 18.8, 1.8, LN);
  },
  sow(p) {
    p.seg(16, 0, 16, 4, 1.8, GM);
    p.box(4.5, 3.5, 23, 4.5, BR, { bevel: 0.8 });
    for (const x of [7, 25]) p.seg(x, 7, x, 19, 1.1, GM);
    const pod = p.ball(16, 13, 3.3, 2.4, SO, { n: 7 });
    p.clip = pod.inside; p.fline(13.5, 13, 18.5, 13, VE[5]); p.clip = null;
    p.box(4.5, 17, 23, 3.6, OL, { bevel: 0.7 });
    for (const x of [6.5, 25.5]) { p.rivet(x, 5.8, 0.6, GM); p.rivet(x, 18.8, 0.6, GM); }
    ground(p, 27, SO);
    for (const [x, top, k] of [[8, 23.8, 1], [16, 22.6, 1.25], [24, 24.4, 0.85]]) {
      p.seg(x, 27.5, x + 0.3, top, 0.75, VE);
      p.leaf(x + 0.1, top + 0.4, x - 2.6 * k, top - 1.2 * k, 1.5 * k, VE, { bend: -0.15 }); p.leaf(x + 0.3, top, x + 3 * k, top - 1.8 * k, 1.4 * k, VE, { bend: 0.15 });
    }
    for (const x of [11, 21]) p.fline(x, 9.5, x, 16, LN[3], 0, -1, 1);
  },
  convert(p) {
    p.seg(9, 13, 4, 5.5, 1.6, BN);
    const sk = p.ball(14.5, 18.5, 10, 8, FL, { n: 9 });
    p.ball(24.5, 21.5, 5.6, 3.6, FL, { n: 7 });
    p.poly([19, 24.5, 29.5, 23, 28, 27, 20, 28.5], FL, P_SH);
    for (let i = 0; i < 4; i++) p.poly([20.5 + i * 2.2, 24.4, 22 + i * 2.2, 24.4, 21.2 + i * 2.2, 26 - (i % 2) * 0.4], BN, P_TOP);
    p.clip = sk.inside; p.fline(7, 15, 12, 15, LN[3], 0, LN[0]); p.fline(12, 15, 14, 12, LN[3], 0, LN[0]); p.fline(9, 20, 13, 20, LN[2], 0, LN[0]); p.fline(13, 20, 15.5, 16.5, LN[2], 0, LN[0]); p.clip = null;
    p.fdot(12, 15, 0.6, LN[4]); p.fdot(13, 20, 0.6, LN[4]);
    p.seg(14, 6.5, 15.5, 12.5, 1.5, GM); p.box(12.2, 4, 4.4, 3, BR, { bevel: 0.6 });
    p.glow(20.5, 15.5, 2.2, LN);
    p.spark(18, 9.5, 1.6, LN[3]);
  },
  print(p) {
    p.seg(4, 4, 4, 29.5, 1.6, GM); p.seg(28, 4, 28, 29.5, 1.6, GM);
    p.box(2.5, 2.5, 27, 3.2, GM, { bevel: 0.6 });
    p.box(13.5, 5.5, 5, 3.6, BR, { bevel: 0.6 });
    p.poly([14.5, 9, 17.5, 9, 16, 12], GM, P_MID);
    ground(p, 28.5, GM);
    p.clip = (_, y) => y > 19.5; beast(p, 16, 23.5, 0.95, 1, FL); p.clip = null;
    p.clip = (_, y) => y <= 19.5; beast(p, 16, 23.5, 0.95, 1, VE, { eye: LN }); p.clip = null;
    p.fline(3, 19.5, 29, 19.5, LN[4]); p.fline(16, 12, 16, 19, LN[3], 0, LN[0], 1.2);
    p.clip = (_, y) => y <= 19.5; for (let y = 13; y < 19.5; y += 2) p.fline(5, y, 27, y, VE[2]); p.clip = null;
  },
  grove(p) {
    p.gem([-1, 31.8, 4, 28.4, 12, 27, 21, 27.2, 28.4, 28.2, 33, 31.8], SO, { crown: 0.1 });
    const tree = (x: number, y0: number, y1: number, w: number, cr: number, sd: number) => {
      const tr = p.seg(x, y0, x, y1, w, BW);
      if (w * p.k >= 2) p.mark([x + w * 0.15, y0 - 1, x + w * 0.1, y1 + 2], tr.part, 1);
      const part = ++p.pid, cy = y1 - cr * 0.55, ins: Inside[] = [];
      for (const [dx, dy, s] of [[-0.5, 0.12, 0.6], [0.48, 0.18, 0.58], [-0.12, 0.34, 0.52], [0.06, -0.34, 0.7]]) ins.push(p.ball(x + dx * cr, cy + dy * cr, cr * s, cr * s * 0.85, VE, { part, seed: sd + Math.round(dx * 10) }).inside);
      // leaf clumps: short dark strokes where the lobes fold, a couple of lit buds
      p.mark([x - cr * 0.15, cy + cr * 0.45, x + cr * 0.05, cy - cr * 0.05, x - cr * 0.3, cy - cr * 0.35], part, 1);
      p.mark([x + cr * 0.55, cy + cr * 0.25, x + cr * 0.25, cy - cr * 0.05], part, 1);
      p.fdot(x - cr * 0.42, cy - cr * 0.2, 0.45, LN[3]); p.fdot(x + cr * 0.3, cy - cr * 0.62, 0.45, LN[2]);
    };
    tree(6.5, 28.5, 21, 1.4, 3.6, 3); tree(25.5, 28.5, 20, 1.6, 4.2, 17); tree(16, 28.5, 15, 2.4, 6.5, 41);
    for (const [x, y] of [[9.5, 6], [24, 7.5], [5, 12], [28.5, 13], [20, 3]]) p.fdot(x, y, 0.55, LN[3], LN[0]);
    p.farc(16, 6, 9, Math.PI * 1.05, Math.PI * 1.95, LN[2], 0, 0.5, -1, 1);
  },
  // ---------------- lab
  lab(p) {
    p.seg(23, 3, 29, 3, 1.4, CU); p.seg(29, 3, 29, 26, 1.4, CU);
    p.box(5.5, 2, 21, 4.2, BR, { bevel: 0.8 });
    const g = p.tank(7.5, 5.5, 17, 21, GL, { r: 1.5, gain: 0.7 });
    p.box(8.5, 9, 15, 17, LB, { bevel: 0.5, lum: 0.6, clip: g.inside });
    p.clip = (x, y) => x > 8.5 && x < 23.5 && y > 9; beast(p, 15.5, 17, 0.6, 1, LBD, { eye: LN, spines: false }); p.clip = null;
    p.clip = g.inside; p.fline(10, 7, 10, 24, GL[5], 0, -1, 2.2); p.clip = null;
    for (const [x, y, r] of [[19, 12, 0.8], [21, 16, 0.6], [12, 21, 0.7], [20.5, 22, 0.5]]) p.fdot(x, y, r, LB[4]);
    p.box(5.5, 25.5, 21, 4.5, BR, { bevel: 0.8 });
    p.rivet(8, 27.8, 0.6, GM); p.rivet(24, 27.8, 0.6, GM);
  },
  splice(p) {
    helix(p, 2, 16, 16, 5.5, 1.1, VE, OR);
    helix(p, 16, 30, 16, 5.5, 1.1, SG, CU);
    p.glow(16, 16, 3, LN); p.spark(16, 16, 4, LN[3]);
  },
  sequencer(p) {
    p.box(2.5, 3, 27, 21, BK, { bevel: 1.2, lum: 0.5, r: 1.2 });
    const scr = p.box(5.5, 6, 21, 14, LN, { bevel: 0.3, lum: 0.05, r: 1.5 });
    p.clip = scr.inside;
    for (let i = 0; i < 26; i++) { const t = i / 25, x = 7 + t * 18, y = 11 + Math.sin(t * TAU * 1.5) * 3; p.fdot(x, y, 0.35, LN[3]); p.fdot(x, 22 - y, 0.35, LN[2]); if (i % 4 === 0) p.fline(x, y, x, 22 - y, LN[1]); }
    for (let i = 0; i < 5; i++) p.box(7 + i * 3.8, 17, 2.6, 1.6, i < 3 ? LN : BK, { lum: i < 3 ? 0.75 : 0.4, bevel: 0.2 });
    p.clip = null;
    p.ball(7, 27, 1.8, 1.8, BR, { n: 6 }); p.ball(12.5, 27, 1.8, 1.8, BR, { n: 6 });
    const tape = p.box(17, 25.5, 13.5, 4, CR, { bevel: 0.4, lum: 0.7 });
    p.clip = tape.inside; for (let x = 18.5; x < 30; x += 2) if (h1(x, 2) > 0.35) p.fdot(x, 27.5, 0.55, BK[0]); p.clip = null;
  },
  vat(p) {
    p.seg(16, 6, 16, 1.5, 1.8, GM); p.ring(16, 2, 1.2, 2.6, RE, { ry: 0.5, n: 7 });
    const v = p.ball(16, 17.5, 12.5, 11, CU, { n: 9 });
    p.clip = v.inside; for (const y of [10, 25]) for (let x = 5; x < 28; x += 2.6 + h1(x, 1) * 0.8) p.fdot(x, y + Math.abs(x - 16) * -0.04, 0.45, CU[6]); p.clip = null;
    p.ring(16, 17.5, 4, 6.4, BR, { n: 8 });
    p.disc(16, 17.5, 4.1, LB[1]);
    p.ball(16.3, 17.8, 3, 2.6, BN, { n: 7 });
    p.ball(17, 18, 1.4, 2.0, INK, { n: 6 });
    p.fdot(17.4, 18.6, 0.6, FI[2]); p.fdot(15.6, 16.6, 0.5, HOT);
    for (const [x, y, r] of [[25, 6, 2.2], [28.5, 3.5, 1.6], [6, 5, 1.6]]) p.ball(x, y, r, r * 0.85, CR, { gain: 0.95, n: 6 });
  },
  // ---------------- story and misc
  planet(p) {
    p.under = true; p.farc(16, 16, 14.5, Math.PI, TAU, CR[3], 1.2, 0.3); p.under = false;
    const disk: number[] = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + 0.15 + (h1(i, 3) - 0.5) * 0.14; disk.push(16 + Math.cos(a) * 11.8, 16 + Math.sin(a) * 11.8); }
    const g = p.gem(disk, WA, { crown: 0.28, top: 0.55 });
    const lands = [inPoly([7.4, 9.6, 10.6, 7.6, 14.6, 8.4, 16.2, 11.2, 15, 13.8, 12.2, 14.4, 11.4, 16.6, 8.6, 16.2, 6.6, 13.2]), inPoly([17.2, 16.4, 20.6, 14.2, 24.2, 15, 26.4, 18, 25, 21.4, 21.8, 24.6, 19.4, 22.8, 19.6, 20]), inPoly([9.6, 20.6, 12.8, 20.8, 14, 23.2, 11.6, 25, 9.4, 23.4])];
    p.solid(4, 4, 28, 28, (x, y) => g.inside(x, y) && lands.some((f) => f(x, y)), SG, g.lum, { part: g.part });
    p.solid(4, 4, 28, 28, (x, y) => g.inside(x, y) && (y < 6.6 + (x - 16) * 0.12 || y > 25.8 + (x - 16) * 0.1), SN, g.lum, { part: g.part });
    p.farc(16, 16, 14.5, 0, Math.PI, CR[4], 1.2, 0.3);
    p.spark(27, 5, 1.6, CR[5]);
  },
  dna(p) {
    const N = 36, P = (t: number, ph: number): [number, number] => [16 + Math.sin(t * TAU * 1.25 + ph) * 6.5, 2.5 + t * 27];
    const strand = (ph: number, r: Ramp, front: boolean) => { for (let i = 0; i < N; i++) { const t0 = i / N, t1 = (i + 1) / N, z = Math.cos(((t0 + t1) / 2) * TAU * 1.25 + ph); if ((z > 0) !== front) continue; const a = P(t0, ph), b = P(t1, ph); p.seg(a[0], a[1], b[0], b[1], 2.0, r, { gain: front ? 1 : 0.6 }); } };
    strand(0, VE, false); strand(Math.PI, OR, false);
    for (let i = 1; i < 9; i++) { const t = i / 9, a = P(t, 0), b = P(t, Math.PI); p.seg(a[0], a[1], b[0], b[1], 1.0, BN, { gain: 0.8 }); }
    strand(0, VE, true); strand(Math.PI, OR, true);
  },
  heart(p) {
    const ht = p.bevel([16, 8.6, 18.2, 5.6, 21.6, 4.2, 25, 4.8, 27.6, 7.6, 28, 11.6, 26.4, 15.4, 22.4, 20.2, 16.2, 27.6, 9.8, 20.6, 5.4, 15.8, 4, 11.8, 4.6, 7.8, 7.2, 5, 10.6, 4.4, 13.8, 5.8], CO, { w: 2.6, lum: P_MID, amb: 0.06 });
    p.poly([8.2, 8.6, 11.2, 6.8, 12.8, 7.8, 9.6, 10.6], CO, 1, { part: ht.part });
  },
  skull(p) {
    const cr = p.gem([16, 3.2, 21.4, 4.2, 25, 7.8, 26.4, 12.8, 25, 17.6, 22, 19.8, 10.2, 19.8, 7, 17.4, 5.6, 12.4, 7.2, 7.4, 10.8, 4.2], BN, { crown: 0.25 });
    const jaw = p.box(9.5, 18.5, 13, 8.5, BN, { r: 2.5, lum: 0.5 });
    p.poly([8.8, 12.8, 12.2, 11.4, 14.2, 13.2, 13.6, 16.6, 10.4, 17.4, 8.4, 15.2], INK, P_MID);
    p.poly([18, 13.4, 20.2, 11.6, 23.4, 12.2, 23.8, 15.4, 22.2, 17.2, 18.8, 16.6], INK, P_MID);
    p.poly([16, 17.6, 14.4, 21, 17.8, 20.8], INK, P_MID);
    for (let x = 11.6; x <= 20.6; x += 2.2) p.mark([x, 23, x + (h1(x, 1) - 0.5) * 0.6, 26.4], jaw.part, 1);
    p.mark([16, 3.4, 17.5, 7.5, 16.5, 9.5], cr.part, 1);
    p.glow(11.4, 14.4, 1.1, LN); p.glow(20.8, 14.2, 1.1, LN);
  },
  pause(p) { p.box(8.5, 6, 5.5, 20, BR, { bevel: 1, r: 1 }); p.box(18, 6, 5.5, 20, BR, { bevel: 1, r: 1 }); },
  stop(p) {
    const pts: number[] = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; pts.push(16 + Math.cos(a) * 13, 16 + Math.sin(a) * 13); }
    p.bevel(pts, RE, { w: 1.8, lum: P_TOP });
    p.box(8.5, 13.5, 15, 5, CR, { bevel: 0.6, lum: 0.75 });
  },
  move(p) {
    p.bevel([16, 3, 28, 15.5, 20.5, 15.5, 20.5, 28.5, 11.5, 28.5, 11.5, 15.5, 4, 15.5], VE, { w: 1.6, lum: P_TOP });
    p.spark(25, 5, 1.4, LN[3]);
  },
  attack(p) {
    p.seg(3, 30, 10, 22, 2.2, GM); p.ball(10.5, 21.5, 2.0, 2.0, BR, { n: 6 });
    const f = p.rock(17, 15.5, 9, 51, RW, { sq: 0.88, cracks: 0 });
    for (let i = 0; i < 3; i++) p.mark([13 + i * 3.5, 9, 10.5 + i * 3.5, 15], f.part, 1);
    p.spark(27.5, 5, 2.5, FI[3]); p.fline(25, 9, 28, 11, FI[3]); p.fline(23, 6, 24, 2.5, FI[3]);
  },
  absorb(p) {
    head(p, 25, 8, 1.55, -1);
    p.clip = (x, y) => x + (h1(Math.floor(y * 2), 3) - 0.5) * 2 < 13.5;
    beast(p, 10.5, 22.5, 0.82, 1, FL);
    p.clip = null;
    for (let i = 0; i < 14; i++) { const t = i / 13, x = 13 + t * 9 + Math.sin(t * 7) * 1.4, y = 21 - t * 11 - Math.sin(t * Math.PI) * 2.5; p.fdot(x, y, 0.35 + (1 - t) * 0.35, i % 3 ? LN[3] : FL[5], LN[0]); }
    p.fline(10, 15, 9, 13, LN[2]);
  },
  territory(p) {
    p.gem([1, 32, 3, 28, 10, 25.6, 22, 25.4, 29, 27.6, 31, 32], VE, { crown: 0.1 });
    p.under = true; p.farc(15, 28.5, 13, 0, TAU, LN[3], 0, 0.28, -1, 1); p.under = false;
    p.seg(13, 29, 13, 3.5, 1.1, GM); p.ball(13, 3.2, 0.9, 0.9, BR, { n: 5 });
    const fl = p.poly([13.5, 4, 28, 8.5, 13.5, 13.5], CR, (x) => (x < 20.5 ? P_TOP : P_MID));
    p.clip = fl.inside; p.poly([13.5, 4, 21, 6.4, 21, 11.2, 13.5, 13.5], GL, P_MID); for (const y of [7.8, 10.2]) p.fline(21, y, 28, 8.5 + (y - 8.5) * 0.3, RE[3]); p.clip = null;
    p.poly(star(17, 8.6, 2.0, 0.85), CR, P_LIT);
  },
  ally(p) {
    p.farc(23, 8.5, 3.5, 0, TAU, LN[3], 0.8, 0.35, LN[0]);
    beast(p, 14, 18.5, 1.05, 1, FL, { eye: LN });
    p.seg(19, 10.5, 20.5, 14, 1.1, GM); p.box(17.6, 8.4, 3, 2.4, BR, { bevel: 0.5 });
    for (const [x, y] of [[6, 7], [27, 16], [4, 14]]) p.fdot(x, y, 0.5, LN[3], LN[0]);
  },
  journal(p) {
    p.poly([2.5, 9, 16, 6.5, 29.5, 9, 29.5, 27, 16, 25, 2.5, 27], CU, P_SH);
    p.poly([4, 8.5, 15.5, 6.5, 15.5, 24, 4, 25.5], CR, (x) => (x < 12.6 ? P_TOP : P_MID));
    p.poly([16.5, 6.5, 28, 8.5, 28, 25.5, 16.5, 24], CR, (x) => (x < 19 ? P_MID : P_TOP));
    for (let i = 0; i < 6; i++) p.fline(5.5, 10.5 + i * 2.4, 14 - h1(i, 3) * 3.5, 9.5 + i * 2.4 + h1(i, 4) * 0.4, CR[1]);
    for (let i = 0; i < 3; i++) p.fline(18, 18 + i * 2.3, 26.5 - h1(i, 5) * 3, 19.2 + i * 2.3, CR[1]);
    p.ring(22, 12.4, 1.6, 2.7, BR, { n: 7 }); p.fdot(22, 12.4, 0.9, LN[2]); p.fline(18.5, 10, 20, 11, CR[1]);
    p.seg(27, 3, 19.5, 17, 1.4, HZ); p.poly([19.0, 16.4, 20.4, 17.2, 18.6, 19.4], BN, P_TOP);
  },
  radio(p) {
    for (const r of [4, 7, 10]) p.farc(20, 8, r, -1.2, 0.2, CR[4 - Math.floor(r / 4)], 0, 1, -1, r > 6 ? 1 : 0);
    p.seg(10, 9, 10, 1.5, 1.0, GM); p.ball(10, 1.6, 0.8, 0.8, RE, { n: 5 });
    p.box(4.5, 8.5, 14, 21, OL, { bevel: 1.1, r: 1.5 });
    const g = p.box(6.5, 11, 10, 7, BK, { bevel: 0.3, lum: 0.25 });
    p.clip = g.inside; for (let y = 12; y < 18; y += 1.4) p.fline(6.5, y, 16.5, y, BK[4]); p.clip = null;
    p.box(6.5, 20, 10, 3.6, LN, { bevel: 0.3, lum: 0.05 }); p.fline(7.5, 21.8, 15.5, 21.8, LN[3], 0, -1, 1.2);
    p.ball(8.5, 26.3, 1.4, 1.4, BR, { n: 6 }); p.ball(14.5, 26.3, 1.4, 1.4, BK, { amb: 0.2, n: 6 });
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
    p.ball(24.5, 13.5, 1.4, 1.1, GM, { gain: 0.35, n: 6 });
    impact(p, 25, 13, 1.6); p.rock(29.5, 4.5, 1.3, 9, RK); streaks(p, 29.5, 4.5, 1, -1.2, 3, 2, 1.1);
  },
  colossus(p) {
    ground(p, 28.5, RK);
    p.clip = (_, y) => y > 28.6; for (const [x1, y1] of [[6, 33], [11, 31], [24, 32], [29, 30]]) p.fline(17, 29, x1, y1, RK[0]); p.clip = null;
    golem(p, { x: 18.5, y: 17.5, s: 1.28, front: [0.45, -0.25], back: [0.5, -0.3], fist: 1.1 });
    // a man for scale
    p.seg(4.6, 28.5, 4.6, 26, 0.9, BK); p.seg(5.8, 28.5, 5.8, 26, 0.9, BK);
    p.box(3.9, 22.4, 2.6, 4.2, CR, { lum: 0.7, bevel: 0.3 });
    p.ball(5.2, 21, 1.15, 1.15, FL, { amb: 0.2, n: 5 });
    for (const [x, y] of [[2.5, 13], [30, 10], [29.5, 20]]) { p.fline(x, y, x + 1.6, y + 0.5, CR[4]); p.fline(x, y + 2, x + 1.2, y + 2.4, CR[4]); }
  },
  bore(p) {
    p.box(-1, 7, 34, 8, SO, { lum: 0.55, bevel: 0.8 });
    p.box(-1, 15, 34, 8, RW, { lum: 0.45, bevel: 0.6 });
    p.box(-1, 23, 34, 10, RD_ROCK, { lum: 0.4, bevel: 0.6 });
    for (const [x, y, r] of [[23, 27, 2.6], [27.5, 25, 1.8], [19, 29.5, 1.6], [7, 27.5, 1.8]]) p.rock(x, y, r, x, OR);
    p.gem([11.4, 13, 13.6, 11.4, 17.6, 11.4, 19.8, 13.2, 20, 27.4, 17.8, 30.6, 13.2, 30.6, 11, 27.6], BK, { gain: 0.3 });
    p.box(12.5, -1, 6, 6.5, OL, { bevel: 0.8 });
    const bit = p.bevel([12.3, 5, 18.7, 5, 15.5, 24], GM, { w: 1.4, lum: P_TOP });
    p.clip = bit.inside; for (let y = 7; y < 24; y += 3) p.fline(12, y + 2.2, 19, y - 1, GM[1]); p.clip = null;
    p.glow(15.5, 23.2, 2.4, FI);
    for (const [x, y] of [[10.5, 19], [20.5, 18], [12, 15.5], [19.5, 22], [9, 23]]) p.fdot(x, y, 0.45, FI[3], FI[0]);
    p.fline(17, 21.5, 21.5, 17.5, FI[2]); p.fline(14, 21.5, 10, 18, FI[2]);
  },
  refinery(p) {
    p.box(3, 25.5, 9, 4, BR, { bevel: 0.6, lum: 0.62 }); p.box(5, 21.8, 9, 4, BR, { bevel: 0.6, lum: 0.7 });
    p.poly([16, 27, 30, 27, 28.5, 30.5, 17.5, 30.5], GM, P_MID);
    p.box(17.5, 26.3, 11, 1.6, FI, { lum: 0.7, bevel: 0.2 });
    p.seg(5.5, 9.5, 1, 13.5, 1.3, GM);
    const cr = p.bevel([3, 6, 13.5, 2, 18, 11.5, 9, 16.5], GM, { w: 1.4, lum: P_MID });
    p.clip = cr.inside; p.poly([11.6, 3.4, 13.8, 2.4, 17.8, 10.9, 15.6, 12], FI, P_TOP); p.fline(4, 7.5, 9.5, 15, GM[2]); p.fline(6.5, 5.5, 12, 13.5, GM[3]); p.clip = null;
    p.glow(16.8, 10.6, 2.0, FI);
    for (let i = 0; i < 9; i++) { const t = i / 8, x = 17.2 + Math.sin(t * 2.4) * 2 + t * 4, y = 11 + t * 15; p.fdot(x, y, 0.9 - t * 0.2, i % 2 ? FI[3] : FI[2], FI[0]); }
    p.plate(22.5, 26.9, 3, 1.1, FI[2], FI[3]);
    for (const [x, y] of [[26, 22], [19.5, 22.5], [28, 19]]) p.fdot(x, y, 0.4, FI[4], FI[1]);
  },
  amp(p) {
    p.under = true; for (const r of [10, 13, 15.5]) p.farc(16, 14.5, r, 0, TAU, VI[r > 12 ? 2 : 3], 0, 0.6, -1, r > 14 ? 1 : 0); p.under = false;
    p.box(9.5, 23, 13, 5, BR, { bevel: 0.9 });
    for (const x of [11.5, 14.5, 17.5, 20.5]) p.seg(x, 28, x, 31, 0.8, GM);
    const tb = p.tank(10, 3, 12, 20.5, GL, { r: 5.5, gain: 0.7 });
    p.clip = tb.inside;
    p.box(11.8, 9, 2.2, 12, GM, { lum: 0.6, bevel: 0.3 }); p.box(18, 9, 2.2, 12, GM, { lum: 0.5, bevel: 0.3 });
    p.glow(16, 14.5, 3.2, FI, { ry: 2.2 }); p.fline(16, 9, 16, 20.5, FI[4]);
    p.fline(12.4, 5.5, 12.4, 18, GL[5], 0, -1, 2);
    p.clip = null;
    p.spark(16, 4.5, 1.6, VI[5]);
  },
  servo(p) {
    p.ring(7, 7, 2.6, 4.6, BR, { n: 8 }); p.disc(7, 7, 2.7, CR[4]);
    p.farc(7, 7, 2.2, Math.PI * 0.75, Math.PI * 1.25, RE[3], 0.6);
    p.fline(7, 7, 9.2, 5.6, INK[0]); p.fdot(7, 7, 0.5, INK[0]);
    p.seg(7, 11.5, 7, 17, 1.0, CU); p.seg(7, 17, 11, 19, 1.0, CU);
    p.tank(5, 17, 9, 13, OL, { r: 2.5 });
    p.seg(9.5, 20, 19.5, 13.5, 1.6, GM);
    p.ball(10, 19.7, 1.4, 1.4, BR, { n: 6 });
    const f = p.rock(22.5, 11.5, 4.8, 51, RW, { sq: 0.9, cracks: 0 });
    p.mark([20, 8, 23, 14], f.part, 1); p.mark([22.5, 7.5, 26, 12], f.part, 1);
    impact(p, 27.5, 6.5, 1.8);
    streaks(p, 22.5, 11.5, 1, -0.6, 4, 3, 1.4);
  },
  command(p) {
    p.under = true; for (const r of [5, 8, 11]) p.farc(10, 5.5, r, -0.2, 1.4, r > 9 ? LN[1] : LN[2], 0, 1, -1, r > 6 ? 1 : 0); p.under = false;
    p.seg(10, 12, 10, 3.5, 0.7, GM); p.ball(10, 3.3, 0.9, 0.9, RE, { n: 5 });
    head(p, 9, 15, 1.55, 1, { antenna: false });
    for (const [x, y, s] of [[22.5, 15, 0.62], [17.5, 25, 0.62]] as [number, number, number][]) {
      const b = beast(p, x, y, s, -1, FL, { eye: LN, spines: false });
      p.farc(b.top[0], b.top[1] - 1.4, 1.8, 0, TAU, LN[3], 0, 0.35, LN[0]);
    }
    p.fdot(26, 24.5, 0.5, LN[3], LN[0]);
  },
  cloner(p) {
    p.seg(15.5, 3, 16.5, 3, 1.2, CU); p.seg(7.5, 3, 24.5, 3, 1.2, CU);
    for (const x of [2, 17.5]) {
      p.box(x, 1.5, 12.5, 3.6, BR, { bevel: 0.7 });
      const g = p.tank(x + 1, 4.5, 10.5, 21, GL, { r: 1.2, gain: 0.7 });
      p.box(x + 1.7, 8, 9, 17, LB, { bevel: 0.4, lum: 0.6, clip: g.inside });
      p.clip = g.inside; beast(p, x + 6, 16.5, 0.42, 1, LBD, { eye: LN, spines: false }); p.fline(x + 2.6, 6, x + 2.6, 23, GL[5], 0, -1, 2); p.clip = null;
      p.box(x, 25, 12.5, 4.5, BR, { bevel: 0.7 });
    }
    p.fline(14.8, 13.5, 17.2, 13.5, LN[3], 0.6, LN[0]); p.fline(14.8, 16, 17.2, 16, LN[3], 0.6, LN[0]);
  },

  // ---------------- the works (factory catalogue)
  works(p) {
    ground(p, 25, SO, true);
    p.rock(7, 27.6, 3.6, 81, RD_ROCK, { sq: 0.55 }); p.rock(5.4, 27, 1.1, 82, OR); p.rock(8.8, 28.2, 0.9, 83, OR);
    derrick(p, 7, 25, 10, 1);
    p.seg(13, 22.4, 13, 25, 0.6, GM); p.seg(18.5, 20, 18.5, 25, 0.6, GM);
    belt(p, 11, 20.5, 20.5, 18, 1.6, 2);
    p.seg(27.5, 13.5, 27.5, 3.5, 1.6, GM);
    const sm = p.box(20, 12.5, 10, 12.5, CU, { bevel: 0.8, lum: 0.45 });
    for (const y of [15.5, 18.5, 21.5]) p.mark([20.3, y, 29.7, y], sm.part, 1);
    for (const [x, y] of [[23, 12.8], [26.5, 15.8], [22, 15.8], [25, 18.8], [28, 18.8], [23.5, 21.8]]) p.mark([x, y, x, y + 2.6], sm.part, 1);
    p.box(22.6, 19.6, 4.4, 3.8, INK, { lum: 0.4, bevel: 0.3 }); p.glow(24.8, 21.6, 1.7, FI);
    p.ball(28.4, 2.4, 2.1, 1.5, CR, { gain: 0.75, n: 6 }); p.ball(25.4, 1.2, 1.5, 1.1, CR, { gain: 0.6, n: 5 });
  },
  miner2(p) {
    ground(p, 26, SO);
    p.rock(16, 28.6, 5.4, 84, RD_ROCK, { sq: 0.45 });
    derrick(p, 16, 26, 8, 2);
    for (const [x, y, r, sd] of [[23.5, 19.5, 1.4, 1], [26, 14.5, 1.1, 2], [8.5, 18.5, 1.2, 3], [27.5, 22.5, 0.9, 4], [5.5, 13.5, 0.8, 5]] as [number, number, number, number][]) p.rock(x, y, r, 90 + sd, OR);
    streaks(p, 23.5, 19.5, 1, -0.9, 3, 2, 1, OR[5]); streaks(p, 8.5, 18.5, -1, -0.9, 3, 2, 1, OR[5]);
    p.spark(16, 26.5, 2.2, FI[3]);
  },
  miner3(p) {
    p.box(-1, 12, 34, 6.5, SO, { lum: 0.5, bevel: 0.6 }); p.box(-1, 18.5, 34, 6, RW, { lum: 0.42, bevel: 0.5 }); p.box(-1, 24.5, 34, 9, RD_ROCK, { lum: 0.38, bevel: 0.5 });
    for (const [x, y, r] of [[6, 28, 1.8], [25.5, 27.5, 2.1], [21, 30.5, 1.3], [9.5, 31, 1.1]]) p.rock(x, y, r, x * 3, OR);
    derrick(p, 16, 12, 4.5, 3);
    p.box(14.6, 12, 2.8, 14.5, INK, { lum: 0.5, bevel: 0.2 });
    p.seg(16, 12, 16, 25.6, 1.1, GM);
    p.bevel([13.4, 25.2, 18.6, 25.2, 16, 30], GM, { w: 0.9, lum: P_LIT });
    p.spark(16, 29.4, 2.6, FI[3]);
    for (const [x, y] of [[12.5, 27.5], [19.6, 27], [13.5, 30.5], [19, 30.6]]) p.fdot(x, y, 0.45, FI[3], FI[0]);
  },
  belt2(p) {
    ground(p, 27.5, SO);
    belt(p, -1, 23, 33, 23, 1.8, 3);
    p.seg(8, 25, 8, 27.5, 0.7, GM); p.seg(24, 25, 24, 27.5, 0.7, GM);
    p.seg(10, 23, 10, 17.6, 0.9, GM); p.seg(22, 23, 22, 13.6, 0.9, GM);
    belt(p, 3, 18.2, 29, 9.4, 1.7, 3);
    streaks(p, 29, 9.4, 1, -0.34, 3, 2, 1.2, CR[3]);
    mkPlate(p, 3, 2.5, 2);
  },
  belt3(p) {
    p.seg(6, 25.6, 6, 31, 0.8, GM); p.seg(22, 18, 22, 31, 0.8, GM);
    belt(p, -1, 27, 33, 11, 2, 6);
    for (const [x, y] of [[6, 20], [14, 16.5], [22, 12.6]]) streaks(p, x, y - 2.4, 1, -0.47, 5, 2, 1.1, CR[3]);
    mkPlate(p, 3, 3, 3);
  },
  assembler(p) {
    ground(p, 28, GM);
    belt(p, -1, 12.5, 8.5, 14.5, 1.5, 1); belt(p, -1, 22, 8.5, 21, 1.5, 1);
    const m = p.box(8, 7.5, 14.5, 20.5, OL, { bevel: 1, lum: 0.5 });
    p.mark([8.4, 11, 22, 11], m.part, 1);
    cog(p, 15.2, 17.4, 4.2, BR);
    p.box(19.4, 8.6, 2, 1.4, LN, { lum: 0.6, bevel: 0.2 });
    belt(p, 22.5, 22.5, 33, 22.5, 1.5, 0);
    p.box(25, 18.3, 5, 4, GM, { bevel: 0.6, lum: 0.62 });
    for (const [x, y] of [[25.9, 19.2], [29.1, 19.2], [25.9, 21.4], [29.1, 21.4]]) p.rivet(x, y, 0.4, GM);
  },
  manufacturer(p) {
    ground(p, 28.5, GM);
    p.box(2.5, 12, 27, 16.5, GM, { bevel: 1, lum: 0.46 });
    for (let i = 0; i < 3; i++) { const x = 2.5 + i * 9; p.poly([x, 12, x, 6.5, x + 9, 12], GM, P_LIT); p.box(x + 0.4, 7.6, 1.4, 4.2, GL, { lum: 0.72, bevel: 0.2 }); }
    for (const y of [14.5, 17.5, 20.5, 23.5]) p.seg(-1, y, 2.8, y, 1, CU);
    cog(p, 10, 20, 4.3, BR, 9);
    p.box(17, 18, 10, 10.5, INK, { lum: 0.5, bevel: 0.3 });
    p.box(17, 18, 10, 1.6, HZ, { lum: 0.6, bevel: 0.2 });
    for (let x = 17.5; x < 27; x += 2) p.fline(x, 19.5, x + 1, 18.1, BK[0]);
    p.ball(22, 24.6, 2.6, 2.6, GM, { n: 7 }); p.ring(22, 24.6, 1, 2, BR, { n: 6 });
    p.fdot(24, 13.8, 0.55, FI[3]); p.fdot(26.5, 13.8, 0.55, LN[3]);
  },
  chem(p) {
    ground(p, 28.5, GM);
    const col = p.tank(4, 3, 6.5, 25.5, GM, { r: 2.4 });
    for (const y of [9, 15, 21]) p.box(4, y, 6.5, 1.1, GM, { lum: 0.3, bevel: 0.3, clip: col.inside });
    p.seg(7.2, 3.4, 7.2, 1, 0.8, GM);
    p.seg(10.5, 7, 15, 7, 1, CU); p.seg(15, 7, 15, 13, 1, CU);
    p.seg(13, 23.5, 12.5, 28.5, 0.8, GM); p.seg(22, 23.5, 22.6, 28.5, 0.8, GM);
    const sp = p.ball(17.5, 18.5, 6, 5.6, GL, { n: 9 });
    p.clip = sp.inside; p.fline(11, 19.2, 24, 18.4, GL[1]); p.clip = null;
    const fl = p.bevel([24, 17.5, 26.6, 17.5, 26.6, 21, 30, 28.2, 20.6, 28.2, 24, 21], GL, { w: 0.8, lum: P_MID, gain: 0.8 });
    p.poly([22.3, 25, 28.4, 25, 30, 28.2, 20.6, 28.2], LB, P_TOP, { clip: fl.inside });
    for (const [x, y] of [[24.5, 23], [26, 21.5], [25.4, 19.6]]) p.fdot(x, y, 0.4, LB[4]);
    p.box(10.6, 25.4, 3.4, 3.1, BK, { bevel: 0.4, lum: 0.5 });
  },
  steam(p) {
    ground(p, 28.5, GM);
    p.seg(5.5, 14, 5.5, 4, 1.6, GM);
    const b = p.box(1.5, 13, 17, 11, CU, { r: 3.2, lum: 0.5, bevel: 0.9 });
    for (const x of [5, 10, 15]) p.mark([x, 13.4, x, 23.6], b.part, 2);
    for (const x of [3.6, 8, 12.4, 16.6]) p.rivet(x, 15, 0.4, GM);
    p.box(4, 23.5, 10, 5, INK, { lum: 0.5, bevel: 0.3 }); p.glow(9, 26, 2, FI, { ry: 0.7 });
    p.ball(6.5, 2.6, 2.2, 1.6, CR, { gain: 0.8, n: 6 }); p.ball(10, 1.5, 1.6, 1.2, CR, { gain: 0.65, n: 5 });
    p.seg(18.5, 17, 21.5, 17, 1.2, CU);
    p.box(21, 12, 9.5, 16.5, OL, { bevel: 0.9, lum: 0.5 });
    p.poly([26.6, 13.4, 23.8, 19, 25.6, 19, 24.6, 24, 28, 17.8, 26.2, 17.8, 27.8, 13.4], FI, P_TOP);
  },
  atomic(p) {
    ground(p, 28.5, RK);
    const pile = p.bevel([5, 28.5, 7.5, 10, 24.5, 10, 27, 28.5], RK, { w: 1.6, lum: P_MID });
    for (const y of [15, 21]) p.mark([6.7, y, 25.3, y], pile.part, 2);
    p.box(12, 14, 8, 10, INK, { lum: 0.5, bevel: 0.3 });
    p.glow(16, 19, 3.4, LN, { ry: 1.35 });
    for (const x of [13.6, 16, 18.4]) p.fline(x, 14.6, x, 23.4, GM[2]);
    crystal(p, 12.5, 10.4, 1.6, 4.5, -0.6, SN); crystal(p, 19.6, 10.4, 1.4, 3.4, 0.7, SN); crystal(p, 16, 10.6, 1.9, 6, 0.1, SN);
    p.spark(23.5, 5, 1.8, LN[3]);
  },
  robotics(p) {
    ground(p, 28.5, GM);
    p.seg(3, 28.5, 3, 3.5, 1.3, GM); p.seg(29, 28.5, 29, 3.5, 1.3, GM, { gain: 0.8 }); p.seg(2.5, 3.5, 29.5, 3.5, 1.4, HZ);
    p.box(9.5, 24.5, 13, 2.2, OL, { bevel: 0.4 });
    p.seg(13.5, 18.5, 13, 24.6, 1.6, GM); p.seg(18, 18.5, 18.5, 24.6, 1.6, GM, { gain: 0.85 });
    p.seg(10.5, 11.5, 8, 18, 1.3, GM, { gain: 0.85 }); p.seg(21, 11.5, 23, 17, 1.3, GM, { gain: 0.8 });
    const t = p.box(10.5, 10.5, 10.5, 8.8, OL, { bevel: 0.8, lum: 0.55 });
    p.mark([11, 14.6, 20.6, 14.6], t.part, 1); p.rivet(12, 12, 0.4, GM); p.rivet(19, 12, 0.4, GM);
    p.box(12.6, 5.6, 6.4, 5, GM, { bevel: 0.6 });
    p.box(13.4, 7, 4.8, 1.6, LN, { lum: 0.7, bevel: 0.2 });
    p.seg(25, 3.8, 25, 8.5, 1, GM); p.seg(25, 8.5, 22.4, 12.6, 0.9, GM);
    p.spark(22, 13, 2.4, FI[3]); p.fdot(23.5, 15.5, 0.4, FI[2]); p.fdot(20.5, 15.8, 0.4, FI[3]);
  },
  turret(p) {
    ground(p, 27, SO);
    p.bevel([5.5, 27, 8, 21, 24, 21, 26.5, 27], GM, { w: 1.2, lum: P_MID });
    p.seg(18, 15.6, 30, 10.8, 1.3, GM); p.seg(18.4, 18.2, 30.4, 13.4, 1.3, GM, { gain: 0.85 });
    const d = p.gem([8.5, 21.4, 9.6, 16.2, 13.4, 13.2, 19, 13.2, 22.6, 16, 23.4, 21.4], OL, { crown: 0.2 });
    p.mark([10.5, 18.2, 22.4, 18.2], d.part, 1);
    p.box(12.4, 15.4, 3, 1.6, INK, { lum: 0.5, bevel: 0.2 });
    p.spark(31, 11.4, 2, FI[3]); p.spark(31.2, 13.6, 1.4, FI[3]);
    for (let i = 0; i < 5; i++) p.box(4 - i * 0.5, 20.5 + i * 1.3, 1.2, 0.9, BR, { lum: 0.6, bevel: 0.2 });
    p.fdot(27, 24.8, 0.45, BR[4]); p.fdot(28.6, 25.6, 0.45, BR[3]);
  },
  haul(p) {
    ground(p, 27, SO, true);
    p.box(-1, 21.5, 6, 3.4, BW, { bevel: 0.5, lum: 0.5 });
    p.fline(5, 22.6, 9.6, 19.6, BR[3]);
    const b = beast(p, 14, 21, 0.95, 1, FL, { eye: LN, spines: false });
    const cr = p.box(9, 12.4, 8, 6, BW, { bevel: 0.6, lum: 0.55 });
    p.mark([9.3, 12.6, 16.7, 18.1], cr.part, 1); p.mark([9.3, 15.4, 16.7, 15.4], cr.part, 1);
    p.fline(10, 18.4, 11.5, 22.4, BR[2]); p.fline(16, 18.4, 15.4, 22.6, BR[2]);
    p.farc(b.top[0], b.top[1] - 1.5, 1.6, 0, TAU, LN[3], 0, 0.35);
  },
  operate(p) {
    ground(p, 28, GM);
    const m = p.box(15, 7, 15, 21, OL, { bevel: 1, lum: 0.5 });
    p.mark([15.4, 12, 29.6, 12], m.part, 1);
    p.ring(24.5, 16.8, 1.8, 3.2, BR, { n: 8 }); p.disc(24.5, 16.8, 1.9, CR[4]); p.fline(24.5, 16.8, 25.8, 15.2, RE[3]);
    p.box(25.2, 8.4, 2.2, 1.4, FI, { lum: 0.7, bevel: 0.2 });
    p.ring(15, 21, 1.2, 3, GM, { n: 7 }); p.seg(15, 21, 12.4, 19.2, 0.7, GM); p.ball(12.2, 19, 0.7, 0.7, BR, { n: 5 });
    p.farc(15, 21, 4.6, -2.6, -1.1, CR[3]);
    const b = beast(p, 6.5, 22.5, 0.62, 1, FL, { eye: LN, spines: false });
    p.farc(b.top[0], b.top[1] - 1.2, 1.3, 0, TAU, LN[3], 0, 0.35);
  },
  blueprint(p) {
    const sh = p.bevel([3, 6.5, 26.5, 4.5, 29, 25.5, 5.4, 28], GL, { w: 1, lum: P_MID });
    p.clip = sh.inside;
    for (let x = 6; x < 30; x += 4) p.fline(x, 3, x - 0.4, 30, GL[3]);
    for (let y = 9; y < 30; y += 4) p.fline(2, y + 0.4, 30, y - 0.6, GL[3]);
    p.clip = null;
    const c = CR[4];
    lines(p, [8, 12, 17, 11.4, 17.6, 21, 8.6, 21.6], c, true); lines(p, [9.6, 21.5, 9.8, 24, 16.6, 23.6, 16.6, 21.1], c);
    lines(p, corners(21.6, 15.4, 3, 8, 0.2), c, true); lines(p, [17.6, 15.6, 18.7, 15.5], c);
    lines(p, [19.5, 23.6, 25.5, 23.2], CR[2]); lines(p, [19.6, 25.2, 23.4, 25], CR[2]);
    p.seg(31, 22, 23.5, 29.5, 1.3, HZ); p.poly([23.0, 28.6, 24.4, 30, 22.2, 30.6], BN, P_TOP);
  },
  // ---------------- biotech
  bt_works(p) {
    p.box(5.5, 4, 21, 26.5, BW, { bevel: 0.8, lum: 0.5, r: 1 });
    p.bevel([7.6, 7.4, 24.6, 7, 24.4, 28.4, 7.8, 28.6], CR, { w: 0.6, lum: P_TOP });
    p.box(12.5, 2.4, 7, 3.6, GM, { bevel: 0.5 });
    beast(p, 15.5, 14.5, 0.55, 1, SG, { spines: false });
    for (const [x0, x1, y] of [[9.5, 18, 20.5], [9.5, 15.5, 22.6], [9.5, 15.8, 24.7], [9.5, 13.5, 26.6]]) p.fline(x0, y, x1, y, CR[1]);
    p.poly([16.8, 23.2, 23.4, 22.2, 23.9, 26.2, 17.4, 27.2], RE, P_TOP);
    p.fline(18, 24.6, 22.6, 23.9, RE[1]); p.fline(18.2, 25.8, 21.4, 25.3, RE[1]);
  },
  bt_reactor(p) {
    ground(p, 28.5, GM);
    p.seg(13.5, 9, 13.5, 3, 1.2, GM); p.ball(13.3, 1.8, 1.3, 1, CR, { gain: 0.6, n: 5 });
    const dg = p.tank(3.5, 7.5, 12.5, 21, CU, { r: 4.5 });
    for (const y of [12, 23]) p.box(3.5, y, 12.5, 1, CU, { lum: 0.3, bevel: 0.3, clip: dg.inside });
    p.box(6.5, 16.5, 6.5, 4.4, INK, { lum: 0.5, bevel: 0.3 }); p.glow(9.75, 18.7, 2.4, FI, { ry: 0.75 });
    p.seg(4.4, 2.4, 8.4, 6.6, 1.1, BN); p.ball(4, 2, 0.9, 0.9, BN, { n: 5 }); p.ball(8.8, 7, 0.9, 0.9, BN, { n: 5 });
    p.seg(16, 15, 22, 15, 0.8, CU);
    p.seg(25, 28.5, 25, 10, 1.2, GM); p.seg(21.5, 11.5, 28.5, 11.5, 1, GM); p.seg(22.5, 15, 27.5, 15, 0.9, GM);
    p.poly([26.6, 0.8, 23.8, 5.4, 25.6, 5.4, 24.6, 9.4, 28.4, 3.8, 26.4, 3.8, 28.2, 0.8], FI, P_TOP);
  },
  bt_vat(p) {
    p.box(8, 1.8, 16, 3.6, BR, { bevel: 0.7 }); p.seg(16, 1.8, 16, 0, 1.2, CU);
    const g = p.tank(9, 5, 14, 21.5, GL, { r: 2.2, gain: 0.7 });
    p.box(9.8, 8, 12.4, 18.5, LB, { bevel: 0.4, lum: 0.62, clip: g.inside });
    p.clip = g.inside;
    p.fline(16, 5.2, 16, 12, LB[1]);
    beast(p, 15.8, 17.5, 0.62, 1, LBD, { eye: LN, spines: false, tuck: 0.55 });
    for (const [x, y, r] of [[12, 21, 0.6], [12.6, 15, 0.45], [20.4, 11.5, 0.55], [19.6, 23, 0.4], [11.6, 10.4, 0.4]]) p.fdot(x, y, r, LB[4]);
    p.fline(10.8, 7, 10.8, 24, GL[5], 0, -1, 2.2);
    p.clip = null;
    p.box(7, 26, 18, 4.2, BR, { bevel: 0.8 });
    p.fdot(10, 28, 0.55, LN[3]); p.fdot(12.2, 28, 0.55, FI[3]);
  },
  bt_habitat(p) {
    ground(p, 26, SO, true);
    const dp = dome(16, 26, 13, 17, 7);
    const d = p.gem(dp, GL, { crown: 0.25, gain: 0.62 });
    p.clip = d.inside;
    p.leaf(8.5, 26, 7, 20, 2, PL, { bend: -0.1 }); p.leaf(9, 26, 11.5, 21, 1.8, PL, { bend: 0.1 });
    beast(p, 14.5, 22.2, 0.42, 1, SG, { spines: false }); beast(p, 21.5, 23, 0.36, -1, SG, { spines: false });
    for (const [f, y] of [[0.87, 17.5], [0.53, 11.6]]) p.fline(16 - 13 * f, y, 16 + 13 * f, y, GM[4]);
    meridians(p, 16, 26, 13, 17, [-0.55, 0, 0.55], GM[4]);
    p.fline(7.4, 17, 9.4, 13.4, CR[4]); p.fline(10.6, 11.4, 12.4, 9.8, CR[4]);
    p.clip = null;
    p.box(24.5, 21.5, 6.5, 4.5, OL, { bevel: 0.6 }); p.ring(27.75, 23.75, 0.6, 1.6, GM, { n: 6 });
  },
  bt_field(p) {
    ground(p, 27, RK);
    const dp = dome(16, 27, 14, 20, 7);
    lines(p, dp, LN[2]);
    p.clip = inPoly(dp);
    for (const y of [20.5, 14]) p.fline(1, y, 31, y, LN[1], 0, -1, 1);
    meridians(p, 16, 27, 14, 20, [-0.6, 0.6], LN[1], 1);
    p.clip = null;
    p.seg(16, 27, 16, 9.5, 1.6, GM);
    for (const y of [14, 17.5, 21]) p.ring(16, y, 1, 2.4, CU, { ry: 0.4, n: 7 });
    p.ball(16, 8, 1.8, 1.8, BR, { n: 6 }); p.glow(16, 8, 1.3, LN);
    lines(p, [17.5, 7.4, 20, 6.4, 19.4, 4.8, 22.4, 3.6], LN[3]); lines(p, [14.4, 7.6, 11.6, 6, 12.4, 4.6, 9.2, 4.4], LN[3]);
    p.spark(26.4, 12.6, 2.2, FI[3]); streaks(p, 26.4, 12.6, -1, 0.3, 3, 1, 0, FI[2]);
  },
  bt_lock(p) {
    helix(p, 1, 31, 13, 4.2, 1.5, VE, OR, 1.1);
    const sk = [[12, 18], [12, 11], [13.4, 8.6], [18.6, 8.6], [20, 11], [20, 18]];
    for (let i = 0; i + 1 < sk.length; i++) p.seg(sk[i][0], sk[i][1], sk[i + 1][0], sk[i + 1][1], 1.6, GM);
    p.box(9.5, 16, 13, 12, BR, { r: 1.2, lum: 0.58, bevel: 0.9 });
    p.disc(16, 21, 1.4, INK[0]); p.poly([15.3, 21.6, 16.7, 21.6, 17.1, 25.2, 14.9, 25.2], INK, P_MID);
    p.spark(23.5, 6, 1.6, LN[3]);
  },
  bt_clone(p) {
    p.box(1.5, 22.5, 13, 2.6, GM, { bevel: 0.5 }); p.box(17.5, 22.5, 13, 2.6, GM, { bevel: 0.5 });
    beast(p, 7.6, 17.6, 0.6, 1, FL, { eye: LN, spines: false });
    beast(p, 23.6, 17.6, 0.6, 1, FL, { eye: LN, spines: false });
    p.clip = (_, y) => y > 11 && y < 22.4; for (let y = 12.2; y < 22.4; y += 2.2) p.fline(17.6, y, 30.4, y, VE[2]); p.clip = null;
    p.fline(13.5, 12, 17.5, 12, LN[3], 0, LN[0], 1); p.fline(16.4, 10.8, 17.6, 12, LN[3]); p.fline(16.4, 13.2, 17.6, 12, LN[3]);
    p.box(9.6, 3, 12.8, 4.4, CR, { lum: 0.62, bevel: 0.4 });
    lines(p, [11.6, 4, 13.6, 6.4], INK[1]); lines(p, [13.6, 4, 11.6, 6.4], INK[1]); lines(p, [15.2, 4.1, 17.2, 4.1, 17.2, 5.2, 15.2, 6.3, 17.4, 6.3], INK[1]);
  },
  bt_dome(p) {
    ground(p, 28, RK);
    const dp = dome(16, 28, 15.5, 24, 9);
    lines(p, dp, LN[3], false, 1.2);
    lines(p, dome(16, 28, 13, 20, 8), LN[1], false, 0, 1);
    p.clip = inPoly(dp); for (const y of [21, 14, 8.5]) p.fline(0, y, 32, y, LN[1], 0, -1, 1); meridians(p, 16, 28, 15.5, 24, [-0.62, -0.3, 0.3, 0.62], LN[1], 1); p.clip = null;
    p.seg(16, 28, 16, 12, 2, GM);
    for (const y of [15.5, 18.5, 21.5, 24.5]) p.ring(16, y, 1.3, 3.2, CU, { ry: 0.4, n: 7 });
    p.ball(16, 10.5, 2.2, 2.2, BR, { n: 7 }); p.glow(16, 10.5, 1.6, LN);
    p.rock(29, 5.4, 2.2, 61, RW); impact(p, 26.4, 8, 1.3);
    mkPlate(p, 2, 2, 2);
  },
};

/** names drawn by other vignettes */
const ALIAS: Record<string, string> = {
  core: 'torso', mirror: 'head', helix: 'dna', tree: 'skills', pulse: 'repulse', pull: 'lift', lode: 'magnet', repel: 'repulse',
  em: 'coil', heal: 'cell', points: 'cell', convertAlly: 'ally', fist: 'attack', pick: 'drill', gene: 'dna', lens: 'head',
};
// blueprint cards: the fallback for any skill without its own vignette, one per branch (and a generic one)
for (const br of ['chassis', 'harvest', 'gravity', 'combat', 'fabrication', 'lab']) ART['card-' + br] = (p) => card(p, br);
ART.card = (p) => card(p, '');
export const HI_ICON_NAMES = [...Object.keys(ART), ...Object.keys(ALIAS)];
export function hasHiIcon(name: string) { return !!ART[name] || !!ALIAS[name]; }
/** the art for a name: its vignette, else (unless a legacy grid exists) the blueprint card of its skill's branch */
function artFor(name: string): Art | null {
  const a = ART[name] ?? ART[ALIAS[name] ?? ''];
  if (a) return a;
  if (ICONS[name]) return null;
  return ART['card-' + (SKILL[name]?.branch ?? '')] ?? ART.card;
}

const pcCache = new Map<string, PixelCanvas>();
/** the vignette `name` painted at px x px (art fills px - 4; outline and shadow use the margin), or null */
export function hiIcon(name: string, px = 36, o: { dim?: boolean; shadow?: boolean } = {}): PixelCanvas | null {
  const art = artFor(name);
  if (!art) return null;
  px = Math.max(12, Math.round(px));
  const key = `${name}|${px}|${o.dim ? 1 : 0}${o.shadow ? 1 : 0}`;
  let pc = pcCache.get(key);
  if (!pc) { pc = paint(art, px, o); pcCache.set(key, pc); }
  return pc;
}
/** paint at 24-47 px of source and blow it up by a whole number to fill px (centred in any remainder) */
function paint(art: Art, px: number, o: { dim?: boolean; shadow?: boolean }): PixelCanvas {
  const k = Math.max(1, Math.round(px / 32)), src = Math.floor(px / k);
  const p = new IP(src); art(p); const pc = p.canvas(o);
  if (k === 1 && src === px) return pc;
  const out = new PixelCanvas(px, px); out.wrap = false; out.clear();
  const off = Math.floor((px - src * k) / 2), d = pc.data, D = out.data;
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const sx = Math.floor((x - off) / k), sy = Math.floor((y - off) / k); if (sx < 0 || sy < 0 || sx >= src || sy >= src) continue;
    const i = (sy * src + sx) * 4, j = (y * px + x) * 4; D[j] = d[i]; D[j + 1] = d[i + 1]; D[j + 2] = d[i + 2]; D[j + 3] = d[i + 3];
  }
  return out;
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
  works: 'works', miner2: 'miner2', miner3: 'miner3', belt2: 'belt2', belt3: 'belt3', assembler: 'assembler', manufacturer: 'manufacturer', chem: 'chem',
  steam: 'steam', atomic: 'atomic', robotics: 'robotics', turret: 'turret', haul: 'haul', operate: 'operate', blueprint: 'blueprint',
  bt_works: 'bt_works', bt_reactor: 'bt_reactor', bt_vat: 'bt_vat', bt_habitat: 'bt_habitat', bt_field: 'bt_field', bt_lock: 'bt_lock', bt_clone: 'bt_clone', bt_dome: 'bt_dome',
};
/** resource -> icon name */
export const RES_ICON: Record<string, string> = { ore: 'ore', carbon: 'carbon', water: 'water', soil: 'soil' };
/** the icon name for a skill id: its vignette, or for a skill added later, its branch's blueprint card */
export function skillIcon(id: string): string { return SKILL_ICON[id] ?? (hasHiIcon(id) ? id : 'card-' + (SKILL[id]?.branch ?? 'x')); }
export function skillIconURL(id: string, px = 36, o: { dim?: boolean; shadow?: boolean } = { shadow: true }) { return iconURL(skillIcon(id), px, o); }

/** the legacy 16 x 16 grid, outlined, upscaled by an integer factor k (18k x 18k) */
export function legacyCanvas(name: string, k = 1, o: { dim?: boolean; shadow?: boolean } = {}): PixelCanvas {
  const g = ICONS[name] ?? ICONS.dna;
  const S = 18, base = new Int32Array(S * S).fill(-1);
  for (let y = 0; y < 16; y++) {
    const row = g[y] ?? '';
    for (let x = 0; x < 16; x++) {
      const ch = row[x]; if (!ch || ch === '.' || ch === ' ') continue;
      const c = PAL[ch]; if (c === undefined) continue;
      base[(y + 1) * S + x + 1] = o.dim ? dimC(c) : c;
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
    for (let y = S - 1; y >= 1; y--) for (let x = S - 1; x >= 1; x--) if (!has(x, y) && has(x - 1, y - 1)) for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) pc.set(x * k + i, y * k + j, OUT, 110);
  }
  return pc;
}

// ------------------------------------------------------------------ legacy 16 x 16 grids
// Each is authored as a 16 x 16 grid of palette letters (each letter a step of a master ramp) (fills and internal shading only); a 1 px dark outline
// is added around every shape automatically so the whole set shares one weight.
export const PAL: Record<string, number> = {
  k: INK[0], K: RAMPS.basalt[2], w: CR[5], s: RK[6], S: RK[5], e: RK[2], E: RK[3],
  g: LN[3], G: LN[2], n: VE[2], m: PL[5], M: PL[3], N: PL[1],
  v: VI[5], V: VI[3], p: VI[1], y: FI[3], Y: OR[4], u: OR[2],
  r: CO[4], R: RE[2], b: BN[5], B: BN[3], o: FI[2], c: WA[5], C: WA[3], x: CU[1], f: RAMPS.plum[5], F: RAMPS.plum[3],
  d: OL[4], D: OL[2], h: OL[0],
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
