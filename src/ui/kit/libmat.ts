// UI KIT · MATERIALS FROM THE MATERIAL LIBRARY (src/gfx/mat: Limbophobia's texture library + the sci-fi set). The kit
// paints no surfaces of its own: every 2D plate face and every 3D-element texture samples a library material at its
// close-up density (matPixels(name, 2)); the kit only adds structure on top (bevels, ink outlines, screws, seams, decals).
//   LIB[mat]               the library material behind each kit material name
//   libSample(name, hd)    the material's pixels (cached) and a sampler that tiles them
//   libFill(px, name, o)   fill a kit Px buffer with a material (tiled, optional tint remap and brightness)
import { matPixels } from '../../gfx/mat';
import { Px } from './px';

/** kit material -> library material */
export const LIB: Record<string, string> = {
  steel: 'metal_brushed', gun: 'metal_anodised_grey', darkSteel: 'panel_anodised_grey', machined: 'metal_machined',
  brass: 'metal_brass', copper: 'q_pipe_copper', enamel: 'enamel_cream', teal: 'enamel_green', olive: 'enamel_olive',
  orange: 'enamel_white', red: 'enamel_red', white: 'enamel_white', rubber: 'rubber_seal', leather: 'rubber_seal',
  wood: 'plank', ochreWood: 'plank', stone: 'stone_rough', ore: 'stone_rough', paper: 'paper', blueprint: 'paper',
  glass: 'glass', blue: 'metal_anodised_blue', yellowPaint: 'enamel_white', hull: 'panel_hull_white', deck: 'deck_plate', galv: 'steel_galvanised',
};
/** tints applied by luminance remap (for kit colours the library has no paint for) */
const TINT: Record<string, [number, number]> = { yellowPaint: [0x5a3c04, 0xffd858], orange: [0xb85a22, 0xffb070], blueprint: [0x1a3a78, 0x7fa6e0], ochreWood: [0x7a5a22, 0xe0b870] };
type Pix = { w: number; h: number; data: Uint8ClampedArray | Uint8Array };
const cache = new Map<string, Pix>();
export function libSample(name: string, hd: 1 | 2 | 4 = 2): Pix {
  const k = name + '|' + hd; let p = cache.get(k);
  if (!p) { try { p = matPixels(name, hd); } catch (e) { console.warn('kit: library material', name, e); p = { w: 1, h: 1, data: new Uint8ClampedArray([128, 128, 128, 255]) }; } cache.set(k, p); }
  return p;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** the library colour of a kit material at (x, y) as [r, g, b], tinted and lit (k = brightness factor) */
export function libColor(kitMat: string, x: number, y: number, k = 1, ox = 0, oy = 0): number {
  const name = LIB[kitMat] ?? kitMat, p = libSample(name);
  const X = (((x + ox) % p.w) + p.w) % p.w, Y = (((y + oy) % p.h) + p.h) % p.h, i = (Y * p.w + X) * 4;
  let r = p.data[i], g = p.data[i + 1], b = p.data[i + 2];
  const tint = TINT[kitMat];
  if (tint) { const l = (r * 0.3 + g * 0.59 + b * 0.11) / 255, [c0, c1] = tint; r = lerp((c0 >> 16) & 255, (c1 >> 16) & 255, l); g = lerp((c0 >> 8) & 255, (c1 >> 8) & 255, l); b = lerp(c0 & 255, c1 & 255, l); }
  r = Math.min(255, Math.max(0, r * k)); g = Math.min(255, Math.max(0, g * k)); b = Math.min(255, Math.max(0, b * k));
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}
/** fill a buffer with a kit material from the library (k brightness, an offset to vary the tile) */
export function libFill(p: Px, kitMat: string, o: { k?: number; ox?: number; oy?: number; inside?: (x: number, y: number) => boolean } = {}) {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { if (o.inside && !o.inside(x, y)) continue; p.set(x, y, libColor(kitMat, x, y, o.k ?? 1, o.ox ?? 0, o.oy ?? 0)); }
}
