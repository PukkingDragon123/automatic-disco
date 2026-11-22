// UI KIT · MATERIALS. Hand-painted pixel-art plates in real materials, painted to their exact size (unique wear, never
// a repeated stamp): worn gunmetal, cream enamel over steel, polished brass with patina, olive drab, paper with fibre
// and foxing, blueprint paper, planked wood, tinted glass, leather, rubber. Every plate has a 1 px ink outline,
// chamfered corners (never rounded), a lit lip on its top-left, a shaded one on its bottom-right, chips and scratches
// along its edges, grime gathered at its foot, and optional screws, rivets, a hazard band and sunk windows.
//   plate(w, h, o)            -> Px (art pixels; show at 2x)
//   skin(el, paint, scale)    paint an element's background to its size, repainted on resize
//   materialField(mat, x, y)  the material's own texture tone at a pixel (for other painters)
import { Px, P, INK, hash, bayer, at, mixHex, screw, rivet, hazard, glassWell, type Ramp } from './px';
import { paintSurface, surfField, type Surf } from './paint';
const surfOf = (m: Mat): Surf => (m === 'leather' ? 'rubber' : m) as Surf;

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

/** the material's own surface detail as whole ramp steps (-2..2) at a pixel (from the smooth surface field) */
export function materialField(mat: Mat, x: number, y: number, seed = 1, _w = 64, _h = 64): number {
  return Math.max(-2, Math.min(2, Math.round(surfField(surfOf(mat), x, y, seed))));
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

/** a plate painted to its size (art pixels): the material from the Limbophobia-style painter (paint.ts), an ink
 *  outline, chamfered corners, a lit lip top-left and a shaded one bottom-right, then its hardware */
export function plate(w: number, h: number, o: PlateOpts = {}): Px {
  w = Math.max(6, Math.round(w)); h = Math.max(6, Math.round(h));
  const p = new Px(w, h), mat = o.mat ?? 'steel', M = MATS[mat], R = M.ramp, seed = o.seed ?? 1, ch = o.chamfer ?? 3;
  const wear = o.wear ?? 0.6, lip = o.lip ?? 2, grime = o.grime ?? 0.6;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && x + y >= ch && (w - 1 - x) + y >= ch && x + (h - 1 - y) >= ch && (w - 1 - x) + (h - 1 - y) >= ch;
  const edgeD = (x: number, y: number) => {
    const d = Math.min(x, y, w - 1 - x, h - 1 - y);
    const c = Math.min(x + y - ch, (w - 1 - x) + y - ch, x + (h - 1 - y) - ch, (w - 1 - x) + (h - 1 - y) - ch) / 1.41;
    return Math.min(d, c);
  };
  const light = (x: number, y: number) => {
    const d = edgeD(x, y);
    let k = (0.5 - y / h) * 0.9 + (0.5 - x / w) * 0.35;
    if (d < 1 + lip) {
      const dl = x, dt = y, dr = w - 1 - x, db = h - 1 - y, m = Math.min(dl, dt, dr, db);
      const litSide = m === dl || m === dt;
      k += litSide ? (d < 2 ? 3 : 1.6) : (d < 2 ? -3 : -1.6);
    }
    return k;
  };
  paintSurface(p, surfOf(mat), (x, y) => inside(x, y) && (o.noInk || edgeD(x, y) >= 1), { seed, wear, grime, h, edge: edgeD, light });
  if (!o.noInk) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x, y) && edgeD(x, y) < 1) p.set(x, y, INK);
  void R; void bayer;
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
