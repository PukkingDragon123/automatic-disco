// Stand-in for Limbophobia's src/entities/portrait.ts in the material library. There a portrait is a render of a real
// human rig; the material library paints without a renderer, so a picture in a frame gets a small hand-pixelled
// head-and-shoulders instead (lit from the upper left, skin, hair and clothes from the seed). Same signatures, so the
// ported painters (photo frames, wall photos, ID cards, CRT mugshots) run unchanged.
import { makeRamp } from '../../pixel';

export interface PortraitOpts {
  app?: unknown; seed?: number; who?: string; outfit?: unknown; w?: number; h?: number;
  frame?: 'head' | 'bust' | 'chest'; light?: string; bg?: number | null; tone?: 'color' | 'grey' | 'sepia' | 'faded'; yaw?: number; expr?: string; key?: string;
}
interface PixelTarget { w: number; h: number; data: Uint8ClampedArray | Uint8Array }
const SKIN = [0xf0c8a0, 0xd8a47a, 0xb07850, 0x8a5a3a, 0x5e3c28];
const HAIR = [0x2a1e16, 0x4a3020, 0x8a6a3a, 0xc8a060, 0x1a1a1c, 0x6a6a66];
const CLOTH = [0x3a4a5e, 0x5a4a3a, 0xd8d4c8, 0xeeb415, 0x4a5a3a, 0x8a3a30];
const h32 = (a: number, b: number) => { let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35); x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); return ((x ^ (x >>> 13)) >>> 0) / 4294967296; };

/** paint a small portrait into pc at (x, y, w, h); always "ready" (returns true) */
export function blitPortrait(pc: PixelTarget, x: number, y: number, w: number, h: number, o: PortraitOpts = {}, fallback = 0x4a4c48, _later?: () => void): boolean {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const s = o.seed ?? 7;
  const tone = o.tone ?? 'color';
  const put = (px: number, py: number, c: number) => {
    if (px < x || py < y || px >= x + w || py >= y + h || px < 0 || py < 0 || px >= pc.w || py >= pc.h) return;
    let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    if (tone !== 'color') { const l = r * 0.3 + g * 0.59 + b * 0.11; if (tone === 'grey') r = g = b = l; else if (tone === 'sepia') { r = l * 1.08; g = l * 0.92; b = l * 0.72; } else { r = (r + 200) / 2; g = (g + 196) / 2; b = (b + 186) / 2; } }
    const k = (py * pc.w + px) * 4; pc.data[k] = Math.min(255, r); pc.data[k + 1] = Math.min(255, g); pc.data[k + 2] = Math.min(255, b); pc.data[k + 3] = 255;
  };
  const bg = o.bg === undefined ? 0x5a5e5a : o.bg;
  const B = makeRamp(bg ?? fallback, 4, { spread: 0.25 });
  if (bg !== null) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, B[(i + j * 2) / (w + h * 2) < 0.4 ? 2 : 1]);
  const sk = makeRamp(SKIN[Math.floor(h32(s, 1) * SKIN.length)], 4, { spread: 0.4 });
  const hr = makeRamp(HAIR[Math.floor(h32(s, 2) * HAIR.length)], 4, { spread: 0.4 });
  const cl = makeRamp(CLOTH[Math.floor(h32(s, 3) * CLOTH.length)], 4, { spread: 0.4 });
  const fr = o.frame ?? 'bust';
  // head centre and radius in the box, shoulders below
  const cx = x + w / 2 - 0.5, hy = y + h * (fr === 'head' ? 0.5 : fr === 'chest' ? 0.32 : 0.4), hrx = Math.max(0.8, w * (fr === 'head' ? 0.32 : 0.22)), hry = hrx * 1.2;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const px = x + i, py = y + j, dx = (px - cx) / hrx, dy = (py - hy) / hry;
    const d = dx * dx + dy * dy;
    if (d <= 1.05) {
      const lit = dx < -0.2 || dy < -0.4 ? 3 : dx > 0.45 ? 1 : 2;
      put(px, py, dy < -0.45 || (d > 0.7 && dy < 0.1) ? hr[lit >= 2 ? 2 : 1] : sk[lit]);
      continue;
    }
    // shoulders
    const sy = hy + hry * 1.1, sw = w * 0.48;
    if (py >= sy && Math.abs(px - cx) <= sw * Math.min(1, 0.55 + (py - sy) / Math.max(1, h * 0.25))) put(px, py, cl[px < cx ? 2 : 1]);
  }
  return true;
}
/** the painted portrait is ready at once: nothing to repaint later */
export function atlasRepaint(_name: string): () => void { return () => {}; }
/** a stock appearance for a seed (only its seed matters to the painted portrait) */
export function stockLook(seed: number): any { return { seed }; }
