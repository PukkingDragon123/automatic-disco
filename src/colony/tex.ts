// Painted textures for the colony hardware: UNAA white hull plate with panel seams, rivet rows, access hatches,
// stencils and edge wear; gunmetal machinery; charred ablative shield; gold insulation foil; hazard stripes; radiator
// fins; arm and drone paint; EVA suit cloth; and a decal sheet (the UNAA roundel, the pod's name, numbers, warning
// placards). Every sheet is drawn by hand-placed rules (a seeded layout, never noise used as the look), crisp at
// 256 texels a metre, with a matching bump map so seams and rivets catch the light.
import * as THREE from 'three';
import { rand } from './kit';

export const COL = {
  hull: '#d9d6cb', hull2: '#cfcbbf', hull3: '#e2dfd5', hull4: '#c6c2b5', seam: '#4c4a44', seamHi: '#f1efe6',
  orange: '#c8642c', orangeD: '#8e4220', blue: '#2b5884', blueD: '#1c3a58', yellow: '#d9a43a', ink: '#23262b',
  gun: '#3a3e42', gun2: '#2c3034', gunHi: '#6a6f72', steel: '#8d8f8a', rust: '#7a4a2a', grime: '#5a5244',
};

type Ctx = CanvasRenderingContext2D;
function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; return [c, g]; }
function texOf(c: HTMLCanvasElement, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}
export interface Sheet { map: THREE.Texture; bump: THREE.Texture }
const CACHE = new Map<string, Sheet | THREE.Texture>();
function cached<T extends Sheet | THREE.Texture>(k: string, f: () => T): T { let v = CACHE.get(k) as T | undefined; if (!v) { v = f(); CACHE.set(k, v); } return v; }

/** a seeded RNG */
function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

/** stencil lettering: block capitals at height h (px), in the 'Superwide' face or a mono for small labels */
function stencil(g: Ctx, text: string, x: number, y: number, h: number, col: string, o: { font?: string; align?: CanvasTextAlign; rot?: number; alpha?: number; spacing?: number } = {}) {
  g.save(); g.translate(x, y); if (o.rot) g.rotate(o.rot);
  g.globalAlpha = o.alpha ?? 1; g.fillStyle = col; g.textAlign = o.align ?? 'left'; g.textBaseline = 'middle';
  g.font = `${h}px ${o.font ?? "'Superwide', 'Jersey', monospace"}`;
  if (o.spacing) (g as unknown as { letterSpacing: string }).letterSpacing = `${o.spacing}px`;
  g.fillText(text, 0, 0);
  g.restore();
}
/** a row of rivets along a line: each a 4 px domed head (lit top-left, shadow bottom-right) */
function rivets(g: Ctx, b: Ctx | null, x0: number, y0: number, x1: number, y1: number, step: number) {
  const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.floor(L / step));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
    g.fillStyle = 'rgba(40,38,34,0.55)'; g.fillRect(x - 1, y - 1, 5, 5);
    g.fillStyle = '#b9b5a8'; g.fillRect(x - 2, y - 2, 4, 4);
    g.fillStyle = '#f4f2ea'; g.fillRect(x - 2, y - 2, 2, 2);
    if (b) { b.fillStyle = '#d8d8d8'; b.fillRect(x - 2, y - 2, 4, 4); b.fillStyle = '#ffffff'; b.fillRect(x - 1, y - 1, 2, 2); }
  }
}
/** a seam: a dark 2 px cut with a 1 px highlight below / right, and a groove in the bump */
function seam(g: Ctx, b: Ctx | null, x: number, y: number, w: number, h: number) {
  g.fillStyle = COL.seam; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(244,242,234,0.55)'; if (w > h) g.fillRect(x, y + h, w, 1); else g.fillRect(x + w, y, 1, h);
  if (b) { b.fillStyle = '#303030'; b.fillRect(x, y, w, h); }
}
/** worn paint along an edge: chips showing primer and bare steel, more toward corners */
function wear(g: Ctx, r: () => number, x: number, y: number, w: number, h: number, k = 1) {
  const n = Math.floor((w + h) * 0.08 * k);
  for (let i = 0; i < n; i++) {
    const edge = Math.floor(r() * 4), t = r();
    let cx = x, cy = y;
    if (edge === 0) { cx = x + t * w; cy = y + 1; } else if (edge === 1) { cx = x + t * w; cy = y + h - 2; } else if (edge === 2) { cx = x + 1; cy = y + t * h; } else { cx = x + w - 2; cy = y + t * h; }
    const s = 1 + Math.floor(r() * r() * 5);
    g.fillStyle = r() < 0.35 ? '#9a978e' : r() < 0.7 ? '#b7b3a6' : '#7d6a55';
    g.fillRect(Math.round(cx - s / 2), Math.round(cy - s / 2), s + Math.floor(r() * 3), s);
  }
}
/** a streak of grime running down from a point (rain-washed dirt under a vent or rivet) */
function streak(g: Ctx, x: number, y: number, len: number, w: number, col: string, a: number) {
  for (let i = 0; i < len; i += 2) { g.globalAlpha = a * (1 - i / len); g.fillStyle = col; g.fillRect(x + Math.round(Math.sin(i * 0.07) * 1), y + i, w, 2); }
  g.globalAlpha = 1;
}
/** a warning triangle placard */
function warnTri(g: Ctx, x: number, y: number, s: number) {
  g.fillStyle = COL.ink; g.beginPath(); g.moveTo(x, y - s * 0.55); g.lineTo(x + s * 0.6, y + s * 0.5); g.lineTo(x - s * 0.6, y + s * 0.5); g.closePath(); g.fill();
  g.fillStyle = COL.yellow; g.beginPath(); g.moveTo(x, y - s * 0.38); g.lineTo(x + s * 0.44, y + s * 0.4); g.lineTo(x - s * 0.44, y + s * 0.4); g.closePath(); g.fill();
  g.fillStyle = COL.ink; g.fillRect(Math.round(x - s * 0.05), Math.round(y - s * 0.15), Math.max(2, Math.round(s * 0.1)), Math.round(s * 0.33)); g.fillRect(Math.round(x - s * 0.05), Math.round(y + s * 0.24), Math.max(2, Math.round(s * 0.1)), Math.max(2, Math.round(s * 0.09)));
}
/** a little barcode / data plate */
function plate(g: Ctx, r: () => number, x: number, y: number, w: number, h: number) {
  g.fillStyle = '#c9c3b0'; g.fillRect(x, y, w, h); g.fillStyle = '#8a8574'; g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y, 1, h);
  g.fillStyle = COL.ink; for (let i = 3; i < w * 0.55; i += 1 + Math.floor(r() * 3)) g.fillRect(x + i, y + 3, 1, h - 6);
  for (let i = 0; i < 3; i++) g.fillRect(x + Math.floor(w * 0.6), y + 3 + i * Math.floor((h - 4) / 3), Math.floor(w * 0.34 * (0.5 + r() * 0.5)), 1);
  g.fillStyle = '#f2efe4'; g.fillRect(x + 1, y + 1, 2, 2);
}

/**
 * The hull: 2048 x 1024 over 8 x 4 m (256 px/m), tiling. Rows of plates of uneven widths; seams with rivet rows;
 * access hatches with screw heads and stencilled labels; small placards; edge wear on the plates' rims; grime streaks
 * from the rivet lines and vents; a few plates replaced in a slightly different white.
 */
export function hullSheet(seed = 7): Sheet {
  return cached('hull' + seed, () => {
    const W = 2048, H = 1024, [c, g] = canvas(W, H), [bc, b] = canvas(W, H), r = rng(seed * 977 + 13);
    b.fillStyle = '#808080'; b.fillRect(0, 0, W, H);
    const rows = [0, 230, 470, 700, 900, 1024];
    const shades = [COL.hull, COL.hull2, COL.hull3, COL.hull, COL.hull4];
    for (let ri = 0; ri < rows.length - 1; ri++) {
      const y0 = rows[ri], y1 = rows[ri + 1];
      let x = Math.floor(r() * 120);
      const xs: number[] = [];
      while (x < W) { xs.push(x); x += 180 + Math.floor(r() * 300); }
      for (let i = 0; i < xs.length; i++) {
        const xa = xs[i], xb = i + 1 < xs.length ? xs[i + 1] : xs[0] + W, w = xb - xa;
        const fill = shades[Math.floor(r() * shades.length)];
        const draw = (ox: number) => {
          g.fillStyle = fill; g.fillRect(xa + ox, y0, w, y1 - y0);
          // the panel's lit upper band and shaded foot (a slight pillow)
          g.fillStyle = 'rgba(255,255,250,0.10)'; g.fillRect(xa + ox + 3, y0 + 3, w - 6, 10);
          g.fillStyle = 'rgba(60,55,45,0.07)'; g.fillRect(xa + ox + 3, y1 - 16, w - 6, 13);
          b.fillStyle = '#8c8c8c'; b.fillRect(xa + ox + 4, y0 + 4, w - 8, y1 - y0 - 8);
        };
        draw(0); if (xb > W) draw(-W);
      }
      for (const xa of xs) { seam(g, b, xa, y0, 2, y1 - y0); rivets(g, b, xa + 9, y0 + 14, xa + 9, y1 - 14, 34); rivets(g, b, xa - 7, y0 + 14, xa - 7, y1 - 14, 34); }
      seam(g, b, 0, y0, W, 2);
      rivets(g, b, 6, y0 + 10, W - 6, y0 + 10, 30);
      // wear along every plate's rim
      for (let i = 0; i < xs.length; i++) { const xa = xs[i], xb = i + 1 < xs.length ? xs[i + 1] : W; wear(g, r, xa + 2, y0 + 2, xb - xa - 2, y1 - y0 - 2, 0.7); }
      // hatches, placards and labels in this row
      const nH = 1 + Math.floor(r() * 2);
      for (let k = 0; k < nH; k++) {
        const hw = 110 + Math.floor(r() * 90), hh = Math.min(y1 - y0 - 60, 80 + Math.floor(r() * 70)), hx = 60 + Math.floor(r() * (W - hw - 120)), hy = y0 + 30 + Math.floor(r() * (y1 - y0 - hh - 50));
        g.fillStyle = 'rgba(70,66,58,0.9)'; g.fillRect(hx - 2, hy - 2, hw + 4, hh + 4);
        g.fillStyle = shades[(k + ri) % shades.length]; g.fillRect(hx, hy, hw, hh);
        g.fillStyle = 'rgba(255,255,250,0.18)'; g.fillRect(hx, hy, hw, 3); g.fillRect(hx, hy, 3, hh);
        g.fillStyle = 'rgba(50,46,40,0.25)'; g.fillRect(hx, hy + hh - 3, hw, 3); g.fillRect(hx + hw - 3, hy, 3, hh);
        b.fillStyle = '#5a5a5a'; b.fillRect(hx - 2, hy - 2, hw + 4, 2); b.fillRect(hx - 2, hy + hh, hw + 4, 2); b.fillRect(hx - 2, hy, 2, hh); b.fillRect(hx + hw, hy, 2, hh);
        for (const [sx, sy] of [[hx + 7, hy + 7], [hx + hw - 10, hy + 7], [hx + 7, hy + hh - 10], [hx + hw - 10, hy + hh - 10]]) { g.fillStyle = '#5f5b52'; g.fillRect(sx, sy, 5, 5); g.fillStyle = '#d4d0c4'; g.fillRect(sx + 1, sy + 2, 3, 1); }
        const labels = ['O2 SVC', 'PWR 28V', 'HYD-3', 'NO STEP', 'COMM', 'DATA BUS', 'H2O FILL', 'N2 PURGE', 'GND PT', 'ARM BUS 2', 'FIRE EXT', 'MAN. VENT'];
        stencil(g, labels[Math.floor(r() * labels.length)], hx + hw / 2, hy + hh / 2, 18, COL.ink, { align: 'center', font: "'VT', monospace", alpha: 0.85 });
        if (r() < 0.6) { g.fillStyle = COL.orange; g.fillRect(hx + 8, hy + hh - 20, 26, 8); }
        streak(g, hx + hw - 14, hy + hh + 4, 60 + r() * 80, 4, COL.grime, 0.18);
      }
      if (r() < 0.8) { const px = Math.floor(r() * (W - 120)), py = y0 + 26 + Math.floor(r() * (y1 - y0 - 70)); plate(g, r, px, py, 72, 30); }
      if (r() < 0.5) { const px = Math.floor(r() * (W - 80)) + 40, py = y0 + 40 + Math.floor(r() * (y1 - y0 - 80)); warnTri(g, px, py, 30); }
      // grime streaks from the rivet row
      for (let k = 0; k < 18; k++) streak(g, Math.floor(r() * W), y0 + 12, 30 + r() * 120, 2 + Math.floor(r() * 3), r() < 0.2 ? COL.rust : COL.grime, 0.08 + r() * 0.14);
    }
    // the orange identification band and the blue program stripe (narrow, across the middle row)
    g.fillStyle = COL.orange; g.fillRect(0, 474, W, 22); g.fillStyle = COL.orangeD; g.fillRect(0, 494, W, 2);
    g.fillStyle = COL.blue; g.fillRect(0, 500, W, 8);
    b.fillStyle = '#868686'; b.fillRect(0, 474, W, 34);
    for (let x = 40; x < W; x += 512) { stencil(g, 'UNAA', x, 485, 18, '#f3efe4', { spacing: 6 }); stencil(g, 'COLONY POD CP-07', x + 150, 485, 14, '#f3efe4', { font: "'VT', monospace", spacing: 2 }); }
    // a dusting of grime toward the feet of the sheet (the lower hull gets dirtier: the shader cannot know, the sheet can)
    for (let y = 0; y < 140; y += 2) { g.fillStyle = `rgba(90,80,62,${(0.12 * (y / 140)).toFixed(3)})`; g.fillRect(0, H - 140 + y, W, 2); }
    return { map: texOf(c), bump: texOf(bc, false) };
  });
}

/** gunmetal machinery: louvred vents, a mesh grille, bolted covers, cable clamps (512 x 512 over 2 x 2 m) */
export function machSheetSmooth(seed = 3): Sheet {
  return cached('mach' + seed, () => {
    const W = 512, [c, g] = canvas(W, W), [bc, b] = canvas(W, W), r = rng(seed * 311 + 7);
    g.fillStyle = COL.gun; g.fillRect(0, 0, W, W); b.fillStyle = '#808080'; b.fillRect(0, 0, W, W);
    for (let i = 0; i < 2600; i++) { const x = Math.floor(r() * W), y = Math.floor(r() * W); g.fillStyle = r() < 0.5 ? '#41454a' : '#353a3e'; g.fillRect(x, y, 2 + Math.floor(r() * 6), 1); }
    // louvres
    for (let y = 30; y < 200; y += 12) { g.fillStyle = '#1c1f22'; g.fillRect(26, y, 210, 6); g.fillStyle = '#5c6165'; g.fillRect(26, y + 6, 210, 2); b.fillStyle = '#404040'; b.fillRect(26, y, 210, 6); b.fillStyle = '#c0c0c0'; b.fillRect(26, y + 6, 210, 2); }
    // grille
    for (let y = 260; y < 480; y += 6) for (let x = 30; x < 230; x += 6) { g.fillStyle = '#16191b'; g.fillRect(x, y, 4, 4); b.fillStyle = '#383838'; b.fillRect(x, y, 4, 4); }
    // bolted covers
    for (const [x, y, w, h] of [[270, 30, 210, 150], [270, 210, 100, 120], [390, 210, 90, 260], [270, 350, 100, 120]]) {
      g.fillStyle = '#44494d'; g.fillRect(x, y, w, h); g.fillStyle = '#5d6266'; g.fillRect(x, y, w, 2); g.fillRect(x, y, 2, h); g.fillStyle = '#25282b'; g.fillRect(x, y + h - 2, w, 2); g.fillRect(x + w - 2, y, 2, h);
      b.fillStyle = '#a0a0a0'; b.fillRect(x + 2, y + 2, w - 4, h - 4);
      for (const [sx, sy] of [[x + 6, y + 6], [x + w - 10, y + 6], [x + 6, y + h - 10], [x + w - 10, y + h - 10]]) { g.fillStyle = '#7d8286'; g.fillRect(sx, sy, 4, 4); g.fillStyle = '#c5c8c6'; g.fillRect(sx, sy, 2, 2); }
      if (r() < 0.7) stencil(g, ['HV', '480V', 'COOLANT', 'FAN 2', 'LOCK'][Math.floor(r() * 5)], x + w / 2, y + h / 2, 14, '#c9b98a', { align: 'center', font: "'VT', monospace", alpha: 0.8 });
    }
    for (let x = 0; x < W; x += 64) { g.fillStyle = COL.yellow; g.fillRect(x + 6, 496, 30, 6); }
    return { map: texOf(c), bump: texOf(bc, false) };
  });
}

/** the ablative heat shield: charred honeycomb, cracked, sooty, with the char thinning to tan at the rim (512 x 512) */
export function shieldSheet(): Sheet {
  return cached('shield', () => {
    const W = 512, [c, g] = canvas(W, W), [bc, b] = canvas(W, W), r = rng(91);
    g.fillStyle = '#2a2420'; g.fillRect(0, 0, W, W); b.fillStyle = '#808080'; b.fillRect(0, 0, W, W);
    const hw = 16, hh = 14;
    for (let row = 0; row * hh < W + hh; row++) for (let col = 0; col * hw < W + hw; col++) {
      const x = col * hw + (row & 1 ? hw / 2 : 0), y = row * hh, k = r();
      g.fillStyle = k < 0.2 ? '#1b1715' : k < 0.6 ? '#2f2823' : k < 0.9 ? '#3a3029' : '#5a4434';
      g.fillRect(x + 2, y + 2, hw - 3, hh - 3);
      g.fillStyle = '#141110'; g.fillRect(x, y, hw, 2); g.fillRect(x, y, 2, hh);
      b.fillStyle = k < 0.3 ? '#606060' : '#909090'; b.fillRect(x + 2, y + 2, hw - 3, hh - 3); b.fillStyle = '#404040'; b.fillRect(x, y, hw, 2); b.fillRect(x, y, 2, hh);
    }
    for (let i = 0; i < 40; i++) { let x = r() * W, y = r() * W; g.strokeStyle = '#0e0c0b'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 40; y += r() * 30; g.lineTo(x, y); } g.stroke(); }
    for (let y = 0; y < 120; y += 2) { g.fillStyle = `rgba(150,110,70,${(0.4 * (1 - y / 120)).toFixed(3)})`; g.fillRect(0, y, W, 2); }
    return { map: texOf(c), bump: texOf(bc, false) };
  });
}

/** gold multi-layer insulation: crinkled foil in long facets, taped seams (512 x 512) */
export function foilSheet(): THREE.Texture {
  return cached('foil', () => {
    const W = 512, [c, g] = canvas(W, W), r = rng(5);
    const tones = ['#9c7a2c', '#b8923a', '#d1ad55', '#e6c97a', '#8a6a24', '#c49d45'];
    for (let i = 0; i < 900; i++) {
      const x = r() * W, y = r() * W, w = 20 + r() * 60, h = 6 + r() * 18, a = (r() - 0.5) * 0.8;
      g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = tones[Math.floor(r() * tones.length)]; g.fillRect(-w / 2, -h / 2, w, h); g.restore();
    }
    for (let x = 0; x < W; x += 128) { g.fillStyle = '#c0a868'; g.fillRect(x, 0, 10, W); g.fillStyle = '#e8d9a0'; g.fillRect(x + 1, 0, 2, W); }
    return texOf(c);
  });
}

/** worn hazard stripes (256 x 64): yellow and ink at 45 degrees, chipped */
export function hazardTexSmooth(): THREE.Texture {
  return cached('hazard', () => {
    const W = 256, H = 64, [c, g] = canvas(W, H), r = rng(17);
    g.fillStyle = COL.yellow; g.fillRect(0, 0, W, H);
    g.fillStyle = COL.ink; for (let x = -H; x < W + H; x += 64) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + 32, H); g.lineTo(x + 32 + H, 0); g.lineTo(x + H, 0); g.closePath(); g.fill(); }
    for (let i = 0; i < 70; i++) { g.fillStyle = r() < 0.5 ? '#8d8f8a' : '#6f6a5c'; g.fillRect(Math.floor(r() * W), Math.floor(r() < 0.5 ? r() * 6 : H - r() * 6), 2 + Math.floor(r() * 5), 2); }
    return texOf(c);
  });
}

/** radiator panel: ribbed fins with coolant tubes (256 x 512) */
export function radiatorSheet(): Sheet {
  return cached('rad', () => {
    const W = 256, H = 512, [c, g] = canvas(W, H), [bc, b] = canvas(W, H);
    g.fillStyle = '#c9c7bf'; g.fillRect(0, 0, W, H); b.fillStyle = '#808080'; b.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 8) { g.fillStyle = '#e4e2da'; g.fillRect(x, 0, 3, H); g.fillStyle = '#8f8c82'; g.fillRect(x + 5, 0, 2, H); b.fillStyle = '#d0d0d0'; b.fillRect(x, 0, 3, H); b.fillStyle = '#404040'; b.fillRect(x + 5, 0, 2, H); }
    for (let y = 30; y < H; y += 120) { g.fillStyle = '#7e5a36'; g.fillRect(0, y, W, 10); g.fillStyle = '#b98454'; g.fillRect(0, y + 1, W, 3); b.fillStyle = '#e0e0e0'; b.fillRect(0, y, W, 10); }
    g.fillStyle = COL.seam; g.fillRect(0, 0, W, 4); g.fillRect(0, H - 4, W, 4); g.fillRect(0, 0, 4, H); g.fillRect(W - 4, 0, 4, H);
    return { map: texOf(c), bump: texOf(bc, false) };
  });
}

/**
 * Industrial arm paint (512 x 512 over 1 x 1 m): UNAA safety orange enamel, scuffed through to primer and steel at
 * the edges, a stencilled serial, a joint-limit decal, grease runs.
 */
export function armSheetSmooth(col = COL.orange, seed = 2): Sheet {
  return cached('arm' + col + seed, () => {
    const W = 512, [c, g] = canvas(W, W), [bc, b] = canvas(W, W), r = rng(seed * 71 + 3);
    g.fillStyle = col; g.fillRect(0, 0, W, W); b.fillStyle = '#808080'; b.fillRect(0, 0, W, W);
    const dark = shade(col, -0.18), light = shade(col, 0.12);
    for (let i = 0; i < 260; i++) { const x = Math.floor(r() * W), y = Math.floor(r() * W); g.fillStyle = r() < 0.5 ? dark : light; g.fillRect(x, y, 6 + Math.floor(r() * 30), 2); }
    for (let i = 0; i < 4; i++) { const y = 40 + i * 120; seam(g, b, 0, y, W, 2); rivets(g, b, 10, y + 10, W - 10, y + 10, 40); }
    wear(g, r, 0, 0, W, W, 3);
    for (let i = 0; i < 30; i++) { const x = Math.floor(r() * W), y = Math.floor(r() * W); g.fillStyle = r() < 0.5 ? '#9a978e' : '#5b4a3a'; g.fillRect(x, y, 3 + Math.floor(r() * 10), 2 + Math.floor(r() * 3)); }
    for (let i = 0; i < 10; i++) streak(g, Math.floor(r() * W), Math.floor(r() * W), 40 + r() * 60, 3, '#2a2420', 0.25);
    stencil(g, 'UNAA-ARM', 30, 90, 22, COL.ink, { font: "'VT', monospace", alpha: 0.8 });
    stencil(g, 'MAX 2400 KG', 30, 330, 16, COL.ink, { font: "'VT', monospace", alpha: 0.75 });
    warnTri(g, 420, 200, 40);
    g.fillStyle = COL.ink; for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x, 470); g.lineTo(x + 20, 470); g.lineTo(x + 40, 450); g.lineTo(x + 20, 450); g.closePath(); g.fill(); }
    return { map: texOf(c), bump: texOf(bc, false) };
  });
}
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16); let rr = (n >> 16) & 255, gg = (n >> 8) & 255, bb = n & 255;
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  rr = f(rr); gg = f(gg); bb = f(bb);
  return `rgb(${rr},${gg},${bb})`;
}

/** EVA suit cloth: white beta cloth weave, quilting seams, a patch slot (256 x 256) */
export function suitSheetSmooth(accent = COL.orange): THREE.Texture {
  return cached('suit' + accent, () => {
    const W = 256, [c, g] = canvas(W, W), r = rng(23);
    g.fillStyle = '#dedbd2'; g.fillRect(0, 0, W, W);
    for (let y = 0; y < W; y += 2) for (let x = (y >> 1) & 1; x < W; x += 2) if (r() < 0.35) { g.fillStyle = '#d0ccc1'; g.fillRect(x, y, 1, 1); }
    for (let y = 0; y < W; y += 32) { g.fillStyle = '#b8b4a8'; g.fillRect(0, y, W, 2); }
    for (let x = 0; x < W; x += 48) { g.fillStyle = '#c4c0b4'; g.fillRect(x, 0, 1, W); }
    g.fillStyle = accent; g.fillRect(0, 100, W, 14); g.fillStyle = shade(accent, -0.3); g.fillRect(0, 112, W, 2);
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(110,95,70,0.25)'; g.fillRect(Math.floor(r() * W), 200 + Math.floor(r() * 56), 4 + Math.floor(r() * 10), 3); }
    return texOf(c);
  });
}

// ------------------------------------------------------------------ decal sheet
/** where each decal sits on the 1024 x 512 decal sheet (pixels): u0, v0, w, h */
export const DECAL: Record<string, [number, number, number, number]> = {
  roundel: [0, 0, 256, 256], name: [256, 0, 768, 96], big07: [256, 96, 256, 160], unaa: [512, 96, 512, 96],
  arrow: [512, 192, 128, 64], noStep: [640, 192, 192, 64], link: [832, 192, 192, 64],
  n1: [0, 256, 96, 96], n2: [96, 256, 96, 96], n3: [192, 256, 96, 96], n4: [288, 256, 96, 96], n5: [384, 256, 96, 96], n6: [480, 256, 96, 96],
  o2: [576, 256, 224, 64], fuel: [800, 256, 224, 64], hazardDia: [576, 320, 128, 128], flagstripe: [704, 320, 320, 64], warn: [704, 384, 128, 128], grid: [832, 384, 192, 128],
};
/** the UNAA roundel: a navy disc, a white ring, the two continents of the program (the Americas over the southern
 *  ice) as a stylised chevron, three stars for the program's founding blocs */
function roundel(g: Ctx, cx: number, cy: number, R: number) {
  g.fillStyle = '#e9e6dc'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.fillStyle = COL.blueD; g.beginPath(); g.arc(cx, cy, R * 0.9, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#e9e6dc'; g.lineWidth = R * 0.05; g.beginPath(); g.arc(cx, cy, R * 0.72, 0, Math.PI * 2); g.stroke();
  // meridians
  g.lineWidth = R * 0.02; g.globalAlpha = 0.6;
  for (const k of [-0.45, 0, 0.45]) { g.beginPath(); g.ellipse(cx, cy, R * 0.72 * Math.abs(Math.cos(k * 2 + 1)) * 0.6 + 2, R * 0.72, 0, 0, Math.PI * 2); g.stroke(); }
  g.beginPath(); g.moveTo(cx - R * 0.72, cy); g.lineTo(cx + R * 0.72, cy); g.stroke(); g.globalAlpha = 1;
  // the chevron (an A: the Americas meeting the ice)
  g.fillStyle = COL.orange; g.beginPath(); g.moveTo(cx, cy - R * 0.55); g.lineTo(cx + R * 0.42, cy + R * 0.38); g.lineTo(cx + R * 0.24, cy + R * 0.38); g.lineTo(cx, cy - R * 0.12); g.lineTo(cx - R * 0.24, cy + R * 0.38); g.lineTo(cx - R * 0.42, cy + R * 0.38); g.closePath(); g.fill();
  g.fillStyle = '#f3efe4'; g.fillRect(cx - R * 0.5, cy + R * 0.44, R, R * 0.07);
  for (const k of [-1, 0, 1]) star(g, cx + k * R * 0.3, cy + R * 0.66 - Math.abs(k) * R * 0.05, R * 0.07, '#f3efe4');
}
function star(g: Ctx, cx: number, cy: number, r: number, col: string) {
  g.fillStyle = col; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i & 1 ? r * 0.45 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
export function decalSheet(): THREE.Texture {
  return cached('decals', () => {
    const [c, g] = canvas(1024, 512);
    g.clearRect(0, 0, 1024, 512);
    const D = DECAL, at = (k: string) => D[k];
    { const [x, y, w] = at('roundel'); roundel(g, x + w / 2, y + w / 2, w * 0.46); }
    { const [x, y, , h] = at('name'); stencil(g, 'UNAA COLONY POD  CP-07', x + 8, y + h * 0.36, 44, COL.ink, { spacing: 3 }); stencil(g, 'UNITED NATIONS OF ANTARCTICA AND THE AMERICAS  ·  PLANETARY RESEARCH PROGRAM', x + 10, y + h * 0.8, 17, COL.ink, { font: "'VT', monospace", alpha: 0.85 }); }
    { const [x, y, w, h] = at('big07'); stencil(g, '07', x + w / 2, y + h / 2 + 4, 150, COL.ink, { align: 'center' }); }
    { const [x, y, , h] = at('unaa'); stencil(g, 'UNAA', x + 6, y + h / 2, 84, COL.blueD, { spacing: 16 }); }
    { const [x, y, w, h] = at('arrow'); g.fillStyle = COL.ink; g.beginPath(); g.moveTo(x + 10, y + h / 2 - 8); g.lineTo(x + w - 40, y + h / 2 - 8); g.lineTo(x + w - 40, y + 8); g.lineTo(x + w - 6, y + h / 2); g.lineTo(x + w - 40, y + h - 8); g.lineTo(x + w - 40, y + h / 2 + 8); g.lineTo(x + 10, y + h / 2 + 8); g.closePath(); g.fill(); }
    { const [x, y, w, h] = at('noStep'); g.strokeStyle = COL.ink; g.lineWidth = 3; g.strokeRect(x + 4, y + 4, w - 8, h - 8); stencil(g, 'NO STEP', x + w / 2, y + h / 2, 28, COL.ink, { align: 'center', font: "'VT', monospace" }); }
    { const [x, y, w, h] = at('link'); g.fillStyle = COL.blueD; g.fillRect(x + 2, y + 2, w - 4, h - 4); stencil(g, 'SHIP AI LINK', x + w / 2, y + h / 2, 22, '#e9e6dc', { align: 'center', font: "'VT', monospace" }); }
    ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'].forEach((k, i) => { const [x, y, w, h] = at(k); g.fillStyle = COL.ink; g.fillRect(x + 6, y + 6, w - 12, h - 12); g.fillStyle = COL.yellow; g.fillRect(x + 10, y + 10, w - 20, h - 20); stencil(g, '0' + (i + 1), x + w / 2, y + h / 2 + 2, 44, COL.ink, { align: 'center' }); });
    { const [x, y, w, h] = at('o2'); g.fillStyle = '#2f6aa0'; g.fillRect(x + 2, y + 2, w - 4, h - 4); stencil(g, 'OXYGEN  O2', x + w / 2, y + h / 2, 26, '#f0ede4', { align: 'center', font: "'VT', monospace" }); }
    { const [x, y, w, h] = at('fuel'); g.fillStyle = '#a8432a'; g.fillRect(x + 2, y + 2, w - 4, h - 4); stencil(g, 'HYDRAZINE', x + w / 2, y + h / 2, 26, '#f0ede4', { align: 'center', font: "'VT', monospace" }); }
    { const [x, y, w] = at('hazardDia'); g.save(); g.translate(x + w / 2, y + w / 2); g.rotate(Math.PI / 4); g.fillStyle = COL.ink; g.fillRect(-42, -42, 84, 84); g.fillStyle = COL.yellow; g.fillRect(-37, -37, 74, 74); g.restore(); stencil(g, 'HV', x + w / 2, y + w / 2 + 2, 30, COL.ink, { align: 'center' }); }
    { const [x, y, w, h] = at('flagstripe'); const cols = [COL.blueD, '#e9e6dc', COL.orange, '#e9e6dc', COL.blueD]; cols.forEach((cc, i) => { g.fillStyle = cc; g.fillRect(x + (i * w) / 5, y + 4, w / 5, h - 8); }); }
    { const [x, y, w] = at('warn'); warnTri(g, x + w / 2, y + w / 2 + 6, 96); }
    { const [x, y, w, h] = at('grid'); g.fillStyle = '#c9c3b0'; g.fillRect(x, y, w, h); const r = rng(4); plate(g, r, x + 8, y + 8, w - 16, 40); stencil(g, 'S/N 07-0001-UNAA', x + 10, y + 70, 16, COL.ink, { font: "'VT', monospace" }); stencil(g, 'MFD 2091 · AUSTRAL YARDS', x + 10, y + 92, 14, COL.ink, { font: "'VT', monospace" }); stencil(g, 'MASS 41 200 KG', x + 10, y + 112, 14, COL.ink, { font: "'VT', monospace" }); }
    const t = texOf(c, true, false);
    return t;
  });
}
/** a decal material region as a UV transform: (u0, v0, su, sv) for a 0..1 quad */
export function decalUV(k: string): [number, number, number, number] {
  const [x, y, w, h] = DECAL[k];
  return [x / 1024, 1 - (y + h) / 512, w / 1024, h / 512];
}

/** a painted lens or window texture: warm interior light behind dark glass with the frame's reflections */
export function windowTex(): THREE.Texture {
  return cached('window', () => {
    const [c, g] = canvas(256, 64);
    g.fillStyle = '#10161b'; g.fillRect(0, 0, 256, 64);
    for (let x = 0; x < 256; x += 32) {
      g.fillStyle = '#d8a860'; g.fillRect(x + 4, 18, 24, 34); g.fillStyle = '#f2d090'; g.fillRect(x + 6, 22, 10, 14);
      g.fillStyle = '#5a4630'; g.fillRect(x + 4, 40, 24, 12);
      g.fillStyle = 'rgba(180,210,230,0.35)'; g.fillRect(x + 4, 4, 24, 6);
    }
    for (let x = 0; x < 256; x += 32) { g.fillStyle = '#262a2e'; g.fillRect(x, 0, 4, 64); }
    return texOf(c);
  });
}
/** small helper: a crisp 2D canvas for HUD art */
export function hudCanvas(w: number, h: number) { return canvas(w, h); }
export { rng, stencil, rand };

// ------------------------------------------------------------------ v6 pixel-art sheets (the user's direction:
// every surface hand-pixelled from the master ramps, nearest filtered, ~40-48 texels a metre like the lowpix models)
import { Pix, fontText } from '../ui/desk/pxPanel';
import { RAMPS as RP } from '../art/palette';
const PCACHE = new Map<string, Sheet | THREE.Texture>();
function pixTex(p: Pix, srgb = true) {
  const t = new THREE.CanvasTexture(p.canvas());
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter; t.generateMipmaps = true; t.anisotropy = 4;
  return t;
}
const h3 = (a: number, b: number, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** a bump map from a Pix: luminance */
function bumpOf(p: Pix) { const b = new Pix(p.w, p.h); for (let i = 0; i < p.w * p.h; i++) { const l = (p.d[i * 4] * 0.3 + p.d[i * 4 + 1] * 0.59 + p.d[i * 4 + 2] * 0.11) | 0; b.d[i * 4] = b.d[i * 4 + 1] = b.d[i * 4 + 2] = l; b.d[i * 4 + 3] = 255; } return pixTex(b, false); }
/** painted enamel plate in one ramp: brush runs, seams with a lit lip, rivets, chips to steel, a hazard band, a stencil */
function enamel(ramp: readonly number[], seed: number, W = 128, o: { hazard?: boolean; text?: string; seams?: number } = {}) {
  const p = new Pix(W, W), n = ramp.length, base = ramp[Math.min(n - 1, 3)];
  p.rect(0, 0, W, W, base);
  for (let i = 0; i < 70; i++) { const x = Math.floor(h3(i, seed, 1) * W), y = Math.floor(h3(i, seed, 2) * W), L = 4 + Math.floor(h3(i, seed, 3) * 14); p.hl(x, Math.min(W - 1, x + L), y, ramp[Math.min(n - 1, h3(i, seed, 4) < 0.6 ? 4 : 2)]); }
  const step = o.seams ?? 32;
  for (let y = step - 1; y < W; y += step) { p.hl(0, W - 1, y, ramp[0]); p.hl(0, W - 1, y + 1 < W ? y + 1 : y, ramp[Math.min(n - 1, 5)]); for (let x = 4; x < W; x += 10) { p.set(x, y - 3, RP.steel[5]); p.set(x + 1, y - 3, RP.steel[3]); p.set(x + 1, y - 2, ramp[0]); } }
  for (let x = 63; x < W; x += 64) { p.vl(x, 0, W - 1, ramp[0]); p.vl(x + 1, 0, W - 1, ramp[Math.min(n - 1, 5)]); }
  for (let i = 0; i < 26; i++) { const x = Math.floor(h3(i, seed, 7) * W), y = (Math.floor(h3(i, seed, 8) * (W / step)) * step + step - 4 + W) % W, w = 2 + Math.floor(h3(i, seed, 9) * 4); for (let k = 0; k < w; k++) p.set(x + k, y, k ? RP.steel[3] : RP.steel[5]); p.set(x + w, y + 1, ramp[0]); }
  for (let i = 0; i < 6; i++) { const x0 = Math.floor(h3(i, seed, 11) * W), y0 = Math.floor(h3(i, seed, 12) * W); for (let t = 0; t < 8; t++) { p.set(x0 + t, y0 + (t >> 1), ramp[Math.min(n - 1, 5)]); p.set(x0 + t, y0 + (t >> 1) + 1, ramp[1]); } }
  if (o.hazard) for (let y = W - 12; y < W - 4; y++) for (let x = 0; x < W; x++) p.set(x, y, ((x + y) >> 2) & 1 ? RP.ochre[4] : RP.ink[1]);
  if (o.text) fontText(p, o.text, 6, 6, RP.ink[1]);
  return p;
}
const RAMP_OF: Record<string, readonly number[]> = { '#c8642c': RP.rust, '#b3542c': RP.coral, '#c79a2a': RP.ochre, '#5d7a8a': RP.slate, '#59604a': RP.olive, '#4b4f78': RP.violet };
export function armSheet(col = COL.orange, seed = 2): Sheet {
  const k = 'parm' + col + seed; let v = PCACHE.get(k) as Sheet | undefined;
  if (!v) { const p = enamel(RAMP_OF[col] ?? RP.rust, seed * 7 + 3, 128, { hazard: true, text: 'UNAA ARM' }); v = { map: pixTex(p), bump: bumpOf(p) }; PCACHE.set(k, v); }
  return v;
}
export function machSheet(seed = 3): Sheet {
  const k = 'pmach' + seed; let v = PCACHE.get(k) as Sheet | undefined;
  if (!v) {
    const p = enamel(RP.steel, seed * 13 + 5, 128, { seams: 64 });
    for (let y = 8; y < 40; y += 4) { p.hl(8, 56, y, RP.ink[0]); p.hl(8, 56, y + 1, RP.steel[5]); }
    for (let y = 72; y < 120; y += 3) for (let x = 8; x < 56; x += 3) { p.set(x, y, RP.ink[0]); p.set(x + 1, y, RP.ink[1]); }
    for (const [x, y] of [[70, 8], [118, 8], [70, 52], [118, 52]]) { p.set(x, y, RP.steel[6]); p.set(x + 1, y + 1, RP.steel[1]); }
    p.rect(72, 72, 48, 6, RP.ochre[4]); for (let x = 72; x < 120; x += 6) p.rect(x, 72, 3, 6, RP.ink[1]);
    v = { map: pixTex(p), bump: bumpOf(p) }; PCACHE.set(k, v);
  }
  return v;
}
export function hazardTex(): THREE.Texture {
  let v = PCACHE.get('phaz') as THREE.Texture | undefined;
  if (!v) { const p = new Pix(32, 16); for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) p.set(x, y, ((x + y) >> 2) & 1 ? RP.ochre[4] : RP.ink[1]); p.hl(0, 31, 0, RP.ochre[5]); p.hl(0, 31, 15, RP.ink[0]); v = pixTex(p); PCACHE.set('phaz', v); }
  return v;
}
export function suitSheet(accent = COL.orange): THREE.Texture {
  const k = 'psuit' + accent; let v = PCACHE.get(k) as THREE.Texture | undefined;
  if (!v) {
    const p = new Pix(64, 64), B = RP.paper;
    p.rect(0, 0, 64, 64, B[4]);
    for (let y = 0; y < 64; y += 8) p.hl(0, 63, y, B[2]);
    for (let x = 0; x < 64; x += 12) p.vl(x, 0, 63, B[3]);
    for (let i = 0; i < 40; i++) p.set(Math.floor(h3(i, 5, 1) * 64), Math.floor(h3(i, 5, 2) * 64), B[5]);
    const A = accent === COL.orange ? RP.rust : RP.teal; p.rect(0, 26, 64, 4, A[4]); p.hl(0, 63, 29, A[2]);
    for (let i = 0; i < 12; i++) p.rect(Math.floor(h3(i, 6, 1) * 60), 50 + Math.floor(h3(i, 6, 2) * 12), 3, 1, RP.soil[3]);
    v = pixTex(p); PCACHE.set(k, v);
  }
  return v;
}
