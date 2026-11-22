// UI KIT · MATERIALS. Hand-painted pixel-art plates in real materials, painted to their exact size (unique wear, never
// a repeated stamp): worn gunmetal, cream enamel over steel, polished brass with patina, olive drab, paper with fibre
// and foxing, blueprint paper, planked wood, tinted glass, leather, rubber. Every plate has a 1 px ink outline,
// chamfered corners (never rounded), a lit lip on its top-left, a shaded one on its bottom-right, chips and scratches
// along its edges, grime gathered at its foot, and optional screws, rivets, a hazard band and sunk windows.
//   plate(w, h, o)            -> Px (art pixels; show at 2x)
//   skin(el, paint, scale)    paint an element's background to its size, repainted on resize
//   materialField(mat, x, y)  the material's own texture tone at a pixel (for other painters)
import { Px, P, INK, hash, bayer, at, mixHex, screw, rivet, hazard, glassWell, type Ramp } from './px';

export type Mat = 'steel' | 'gun' | 'enamel' | 'brass' | 'olive' | 'paper' | 'blueprint' | 'wood' | 'glass' | 'leather' | 'rubber' | 'orange' | 'copper';
interface MatDef { ramp: Ramp; base: number; under?: Ramp; underK?: number; metal?: boolean }
const MATS: Record<Mat, MatDef> = {
  steel: { ramp: P.steel, base: 3, metal: true },
  gun: { ramp: P.steel, base: 2, metal: true },
  enamel: { ramp: P.bone, base: 4, under: P.steel, underK: 2 },
  brass: { ramp: P.brass, base: 3, metal: true },
  olive: { ramp: P.olive, base: 3, under: P.steel, underK: 3 },
  paper: { ramp: P.paper, base: 4 },
  blueprint: { ramp: P.sapphire, base: 2 },
  wood: { ramp: P.soil, base: 4 },
  glass: { ramp: P.water, base: 1 },
  leather: { ramp: P.clay, base: 2 },
  rubber: { ramp: P.basalt, base: 2 },
  orange: { ramp: P.rust, base: 4, under: P.steel, underK: 2 },
  copper: { ramp: P.copper, base: 3, metal: true },
};

/** the material's own surface detail: a ramp-step offset (-2..2) at a pixel (deterministic per seed) */
export function materialField(mat: Mat, x: number, y: number, seed = 1, w = 64, h = 64): number {
  const r = (a: number, b: number, c = 0) => hash(a + seed * 131, b + seed * 71, c);
  switch (mat) {
    case 'steel': case 'gun': case 'copper': {
      // brushed: long horizontal strokes, a few deeper scratches at an angle
      const row = Math.floor(y), streak = r(Math.floor(x / (9 + Math.floor(r(row, 1) * 14))), row, 2);
      let v = streak > 0.82 ? 1 : streak < 0.1 ? -1 : 0;
      const sc = (x * 3 + y * 7 + Math.floor(r(0, Math.floor((x - y * 2) / 23), 4) * 40)) % 97;
      if (sc === 0 && r(x, y, 5) > 0.3) v = 1;
      return v;
    }
    case 'brass': {
      const band = Math.sin((x * 0.09 + y * 0.35) + r(0, Math.floor(y / 5), 1) * 2) > 0.86 ? 1 : 0;
      return band + (r(x >> 1, y >> 1, 3) > 0.94 ? -1 : 0);
    }
    case 'enamel': case 'olive': case 'orange': {
      // flat paint with a slight orange peel and a few brush marks
      return r(x >> 2, y >> 1, 6) > 0.9 ? 1 : r(x >> 1, y >> 2, 7) > 0.95 ? -1 : 0;
    }
    case 'paper': {
      // fibres: short strokes in every direction, a few foxing spots
      let v = r(x, y, 8) > 0.93 ? (r(x, y, 9) > 0.5 ? 1 : -1) : 0;
      const fx = Math.floor(r(Math.floor(x / 11), Math.floor(y / 9), 10) * 11), fy = Math.floor(r(Math.floor(x / 11), Math.floor(y / 9), 11) * 9);
      if (Math.hypot((x % 11) - fx, (y % 9) - fy) < 1.2 && r(Math.floor(x / 11), Math.floor(y / 9), 12) > 0.8) v = -2;
      return v;
    }
    case 'blueprint': {
      const g = (x % 8 === 0 || y % 8 === 0) ? 1 : 0;
      return g + (r(x, y, 13) > 0.96 ? 1 : 0);
    }
    case 'wood': {
      // planks 14 px tall: a dark seam and a lit edge between them, long wandering grain lines, knots, end joints
      const plank = Math.floor(y / 14), yy = y % 14;
      if (yy === 0) return -3;
      if (yy === 1) return 1;
      const joint = Math.floor(r(plank, 0, 30) * 60) + 40;
      if ((x + plank * 37) % joint === 0) return -2;
      const wob = Math.sin(x * 0.045 + plank * 1.7) * 1.6 + Math.sin(x * 0.13 + plank * 0.6) * 0.6;
      const gy = yy + wob;
      const kx = Math.floor(r(plank, 3, 14) * w), kd = Math.hypot((x - kx) * 0.45, yy - 7);
      if (kd < 1.6) return -2; if (kd < 2.8) return -1;
      const ring = Math.abs(((gy + kd * 0.4) % 4.5) - 2.25) < 0.45;
      return ring ? -1 : (yy === 2 || yy === 13) ? (yy === 2 ? 0 : -1) : 0;
    }
    case 'glass': return (x + y * 2) % 23 < 2 ? 2 : 0;
    case 'leather': {
      // soft mottling (big, low-contrast blotches), a fine pebble grain, a few creases
      const m = (r(x >> 2, y >> 2, 16) + r((x + 2) >> 2, (y + 1) >> 2, 16) + r((x + 1) >> 3, y >> 3, 20) * 2) / 4;
      let v = m > 0.72 ? 1 : m < 0.24 ? -1 : 0;
      if ((x * 5 + y * 3) % 11 === 0 && r(x, y, 17) > 0.5) v -= 1;
      const cr = (x + Math.floor(r(0, Math.floor(y / 9), 18) * 30) + y * 2) % 41;
      if (cr === 0 && r(x >> 2, y >> 2, 19) > 0.4) v -= 1;
      return v;
    }
    case 'rubber': return (x + y) % 4 === 0 ? -1 : 0;
  }
}

export interface PlateOpts {
  mat?: Mat; seed?: number;
  /** chamfer size in art px (corners are cut, never rounded) */
  chamfer?: number;
  screws?: boolean; rivets?: boolean;
  /** how worn 0..2 (chips, scratches, grime) */
  wear?: number;
  /** a hazard band along the bottom (art px tall) */
  hazard?: number;
  /** sunk glass windows (art px rects); 'clear' cuts them transparent instead */
  wells?: [number, number, number, number, ('glass' | 'clear' | number)?][];
  /** draw no outline (a part inside another painter's frame) */
  noInk?: boolean;
  /** a raised bevel (default 2 px) */
  lip?: number;
  /** grime at the foot 0..1 */
  grime?: number;
}

/** a plate painted to its size (art pixels) */
export function plate(w: number, h: number, o: PlateOpts = {}): Px {
  w = Math.max(6, Math.round(w)); h = Math.max(6, Math.round(h));
  const p = new Px(w, h), mat = o.mat ?? 'steel', M = MATS[mat], R = M.ramp, seed = o.seed ?? 1, ch = o.chamfer ?? 3;
  const wear = o.wear ?? 0.6, lip = o.lip ?? 2, grime = o.grime ?? 0.6;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && x + y >= ch && (w - 1 - x) + y >= ch && x + (h - 1 - y) >= ch && (w - 1 - x) + (h - 1 - y) >= ch;
  // distance to the plate edge (for the bevel and the edge wear)
  const edgeD = (x: number, y: number) => {
    const d = Math.min(x, y, w - 1 - x, h - 1 - y);
    const c = Math.min(x + y - ch, (w - 1 - x) + y - ch, x + (h - 1 - y) - ch, (w - 1 - x) + (h - 1 - y) - ch) / 1.41;
    return Math.min(d, c);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    const d = edgeD(x, y);
    if (d < 1 && !o.noInk) { p.set(x, y, INK); continue; }
    let k = M.base + materialField(mat, x, y, seed, w, h);
    // the bevel: top/left lip lit, bottom/right shaded (a chamfer's diagonal takes the side it faces)
    const dl = x, dt = y, dr = w - 1 - x, db = h - 1 - y;
    const m = Math.min(dl, dt, dr, db);
    if (d < 1 + lip) {
      const litSide = (m === dl || m === dt) && !(m === db && dl > dr) ;
      k += litSide ? (d < 2 ? 2 : 1) : (d < 2 ? -2 : -1);
    }
    // a broad top-left light across the face and grime at the foot (dithered steps)
    const g = (y / h) * grime * 1.6 - (1 - x / w) * 0.25;
    if (g + (bayer(x, y) - 0.5) * 0.5 > 0.75) k -= 1;
    if (g + (bayer(x, y) - 0.5) * 0.5 < -0.15 && d > lip + 1) k += 0;
    p.set(x, y, at(R, k));
  }
  // edge wear: chips through the paint to the metal under it (with a shaded upper-left lip and a lit lower-right
  // one), or bright nicks on bare metal
  const nChips = Math.round((w + h) * 0.06 * wear);
  for (let i = 0; i < nChips; i++) {
    const side = Math.floor(hash(i, seed, 21) * 4), t = hash(i, seed, 22);
    const cx = side === 0 ? Math.round(t * w) : side === 1 ? w - 3 - Math.floor(hash(i, seed, 23) * 3) : side === 2 ? Math.round(t * w) : 2 + Math.floor(hash(i, seed, 23) * 3);
    const cy = side === 0 ? 2 + Math.floor(hash(i, seed, 23) * 3) : side === 1 ? Math.round(t * h) : side === 2 ? h - 3 - Math.floor(hash(i, seed, 23) * 3) : Math.round(t * h);
    const sz = 1 + Math.floor(hash(i, seed, 24) * 3);
    for (let j = 0; j < sz; j++) for (let q = 0; q < sz + 1 - (j & 1); q++) {
      const x = cx + q - (j >> 1), y = cy + j;
      if (!inside(x, y) || edgeD(x, y) < 1) continue;
      if (M.under) p.set(x, y, j === 0 || q === 0 ? at(M.under, (M.underK ?? 2) - 1) : at(M.under, M.underK ?? 2));
      else p.set(x, y, at(R, M.base + (j === 0 ? 2 : 1)));
    }
  }
  // a few scratches across the face
  const nScr = Math.round(wear * 3 * Math.min(3, (w * h) / 4000 + 1));
  for (let i = 0; i < nScr; i++) {
    const x0 = 6 + hash(i, seed, 31) * (w - 12), y0 = 6 + hash(i, seed, 32) * (h - 12), L = 4 + hash(i, seed, 33) * 12, a = -0.6 + hash(i, seed, 34) * 0.5;
    for (let s = 0; s < L; s++) { const x = Math.round(x0 + Math.cos(a) * s), y = Math.round(y0 + Math.sin(a) * s); if (inside(x, y) && edgeD(x, y) > 3) p.set(x, y, at(R, M.base + (M.metal ? 2 : 1))); }
  }
  // hazard band
  if (o.hazard) { const hh = o.hazard; hazard(p, ch + 2, h - hh - 3, w - ch * 2 - 4, hh, P.ochre[5], P.ink[1]); p.hl(ch + 2, w - ch - 3, h - hh - 4, INK); }
  // screws and rivet rows
  if (o.screws) { const s = Math.max(3, ch + 1); screw(p, s, s, seed); screw(p, w - s - 5, s, seed + 1); screw(p, s, h - s - 5, seed + 2); screw(p, w - s - 5, h - s - 5, seed + 3); }
  if (o.rivets) { const off = o.screws ? 14 : 6; for (let x = off; x < w - off; x += 10) { rivet(p, x, 4, 1, P.steel); rivet(p, x, h - 5, 1, P.steel); } }
  // windows
  for (const wl of o.wells ?? []) {
    const [x, y, ww, wh, kind] = wl;
    if (kind === 'clear') { for (let j = 0; j < wh; j++) for (let i = 0; i < ww; i++) p.clear(x + i, y + j); p.hl(x - 1, x + ww, y - 1, INK); p.hl(x - 1, x + ww, y + wh, at(R, M.base + 2)); p.vl(x - 1, y - 1, y + wh, INK); p.vl(x + ww, y - 1, y + wh, at(R, M.base + 1)); }
    else glassWell(p, x, y, ww, wh, typeof kind === 'number' ? kind : 0x0c1416);
  }
  return p;
}

/** a brass or enamel nameplate strip with screws at its ends (for a number or a word painted on top by the caller) */
export function strip(w: number, h: number, mat: Mat = 'brass', seed = 3): Px {
  const p = plate(w, h, { mat, seed, chamfer: 2, wear: 0.4, lip: 1, grime: 0.2 });
  if (w > 24) { rivet(p, 4, Math.floor(h / 2), 1, mat === 'brass' ? P.brass : P.steel); rivet(p, w - 5, Math.floor(h / 2), 1, mat === 'brass' ? P.brass : P.steel); }
  return p;
}

/** a soft pixel shadow ellipse (dithered), for objects floating over the world */
export function shadowBlob(w: number, h: number, a = 0.55): Px {
  const p = new Px(w, h), cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot((x + 0.5 - cx) / (w / 2), (y + 0.5 - cy) / (h / 2));
    if (d > 1) continue;
    const k = (1 - d) * 1.6;
    if (k + (bayer(x, y) - 0.5) * 0.6 > 0.25) p.set(x, y, 0x050608, Math.round(255 * a * Math.min(1, 0.45 + k * 0.5)));
  }
  return p;
}

// ------------------------------------------------------------------ skinning DOM elements
const skins = new WeakMap<HTMLElement, { cv: HTMLCanvasElement; key: string; ro: ResizeObserver | null; paint: (w: number, h: number) => Px; scale: number }>();
/**
 * paint an element's background as pixel art at `scale` screen px per art px (default 2), repainted when it is resized.
 * The canvas sits behind the element's content; the element keeps its own layout.
 */
export function skin(el: HTMLElement, paint: (w: number, h: number) => Px, scale = 2) {
  let s = skins.get(el);
  if (!s) {
    const cv = document.createElement('canvas');
    cv.className = 'k7-skin';
    cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:0;pointer-events:none;image-rendering:pixelated';
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.isolation = 'isolate';
    el.prepend(cv);
    s = { cv, key: '', ro: null, paint, scale };
    skins.set(el, s);
    const ss = s;
    const go = () => {
      const W = Math.max(6, Math.round(el.clientWidth / ss.scale)), H = Math.max(6, Math.round(el.clientHeight / ss.scale)), key = W + 'x' + H;
      if (key === ss.key || el.clientWidth < 2) return;
      ss.key = key; ss.paint(W, H).canvas(ss.cv);
      ss.cv.style.width = W * ss.scale + 'px'; ss.cv.style.height = H * ss.scale + 'px';
    };
    if (typeof ResizeObserver !== 'undefined') { s.ro = new ResizeObserver(go); s.ro.observe(el); }
    requestAnimationFrame(go);
  } else { s.paint = paint; s.scale = scale; s.key = ''; }
  return { repaint: () => { const q = skins.get(el); if (q) { q.key = ''; q.ro?.disconnect(); q.ro?.observe(el); } } };
}

/** a small canvas of a Px shown at scale (a sprite element) */
export function pxCanvas(p: Px, scale = 2, cls = ''): HTMLCanvasElement {
  const cv = p.canvas();
  cv.className = cls;
  cv.style.width = p.w * scale + 'px'; cv.style.height = p.h * scale + 'px'; cv.style.imageRendering = 'pixelated';
  return cv;
}

export { mixHex };
