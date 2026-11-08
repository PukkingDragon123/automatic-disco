// Pixel-art generators for the UI: decoded icons, 9-slice frames, buttons, backgrounds and bars, all painted at
// 1x into canvases and shown at integer scale with nearest filtering.
import { PixelCanvas, makeRamp, mixHex } from '../limbo/gfx/pixel';
import { tileFbm, hashf } from '../limbo/core/rng';
import { ICONS, PAL } from './icons';

const cache = new Map<string, string>();
export function toURL(pc: PixelCanvas): string {
  const c = document.createElement('canvas'); c.width = pc.w; c.height = pc.h;
  c.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  return c.toDataURL();
}

/** decode a 16 x 16 icon, add the outline (and an optional drop shadow), tint for disabled */
export function iconCanvas(name: string, o: { dim?: boolean; shadow?: boolean } = {}): PixelCanvas {
  const g = ICONS[name] ?? ICONS.dna;
  const pc = new PixelCanvas(18, 18); pc.wrap = false; pc.clear();
  for (let y = 0; y < 16; y++) {
    const row = g[y] ?? '';
    for (let x = 0; x < 16; x++) {
      const ch = row[x];
      if (!ch || ch === '.' || ch === ' ') continue;
      let c = PAL[ch]; if (c === undefined) continue;
      if (o.dim) { const l = (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) | 0; c = mixHex((l << 16) | (l << 8) | l, 0x101018, 0.45); }
      pc.set(x + 1, y + 1, c);
    }
  }
  // outline: any empty pixel touching a filled one (8-neighbourhood for chunky icons)
  const src = new Uint8ClampedArray(pc.data);
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < 18 && y < 18 && src[(y * 18 + x) * 4 + 3] > 0;
  for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) {
    if (filled(x, y)) continue;
    let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && filled(x + dx, y + dy)) n++;
    if (n) pc.set(x, y, PAL.k);
  }
  if (o.shadow) {
    const s2 = new Uint8ClampedArray(pc.data);
    for (let y = 17; y >= 1; y--) for (let x = 17; x >= 1; x--) if (s2[(y * 18 + x) * 4 + 3] === 0 && s2[((y - 1) * 18 + x - 1) * 4 + 3] > 0) pc.set(x, y, 0x000000, 110);
  }
  return pc;
}
export function icon(name: string, o: { dim?: boolean; shadow?: boolean } = {}): string {
  const k = 'i:' + name + (o.dim ? ':d' : '') + (o.shadow ? ':s' : '');
  let u = cache.get(k); if (!u) cache.set(k, (u = toURL(iconCanvas(name, o))));
  return u;
}

// ------------------------------------------------------------------ frames
const CH = makeRamp(0x24464a, 7, { spread: 0.62, hueShift: 0.04 });     // chitin
const BN = makeRamp(0xd8cbaa, 6, { spread: 0.5 });                        // bone
const MS = makeRamp(0x2f9a5e, 6, { spread: 0.6 });                        // moss
const GL = [0x1f6a5a, 0x3ac8a0, 0x7affe0, 0xe8fff8];                     // glow

/** membrane background tile (tileable) */
function membrane(pc: PixelCanvas, x0: number, y0: number, w: number, h: number, seed = 3, alpha = 238) {
  // a quiet cellular tissue: faint cell walls, a little grain, the odd vein fleck
  const base = 0x0f171b, wall = 0x142228, fleck = 0x163630;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = Math.floor((x + Math.sin(y * 0.5 + seed) * 1.5) / 8), cy = Math.floor((y + Math.sin(x * 0.5) * 1.5) / 8);
    const fx = ((x + Math.sin(y * 0.5 + seed) * 1.5) % 8 + 8) % 8, fy = ((y + Math.sin(x * 0.5) * 1.5) % 8 + 8) % 8;
    let c = (fx < 1 || fy < 1) && hashf(cx, cy, seed) > 0.25 ? wall : base;
    const n = tileFbm(x, y, 32, 32, 4, 2, seed);
    if (n > 0.7 && (x + y) % 2 === 0) c = wall;
    if (((x * 7 + y * 13 + seed) % 97) === 0) c = fleck;
    pc.set(x0 + x, y0 + y, c, alpha);
  }
}

/**
 * Panel 9-slice: 48 x 48 source, 16 px slices. Chitin rim with bevel, bone knuckles at the corners holding a
 * glowing node, a moss tuft spilling over the top-left corner.
 */
export function panelURL(kind: 'panel' | 'inset' | 'dark' = 'panel'): string {
  const k = 'p:' + kind;
  const hit = cache.get(k); if (hit) return hit;
  const S = 48, pc = new PixelCanvas(S, S); pc.wrap = false; pc.clear();
  membrane(pc, 3, 3, S - 6, S - 6, 7, kind === 'dark' ? 248 : kind === 'inset' ? 230 : 238);
  // rim
  for (let i = 0; i < S; i++) {
    for (const [x, y, side] of [[i, 0, 0], [i, S - 1, 2], [0, i, 3], [S - 1, i, 1]] as [number, number, number][]) pc.set(x, y, PAL.k);
    // two-pixel chitin band with bevel: lit top/left, shadowed bottom/right
    const seg = (i % 9 === 0) ? -1 : 0;
    pc.set(i, 1, CH[5 + seg]); pc.set(i, 2, CH[3 + seg]);
    pc.set(1, i, CH[4 + seg]); pc.set(2, i, CH[3 + seg]);
    pc.set(i, S - 2, CH[1]); pc.set(i, S - 3, CH[2 + seg]);
    pc.set(S - 2, i, CH[1]); pc.set(S - 3, i, CH[2 + seg]);
    if (kind !== 'inset') { pc.set(i, 3, 0x0a1214, 160); pc.set(3, i, 0x0a1214, 160); }
  }
  if (kind !== 'inset') {
    // bone knuckles + glowing nodes at the four corners
    const knuckle = (cx: number, cy: number) => {
      for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
        const d = Math.hypot(x, y); if (d > 4.3) continue;
        pc.set(cx + x, cy + y, d > 3.4 ? PAL.k : BN[Math.max(0, Math.min(5, Math.round(3.2 - (x + y) * 0.45)))]);
      }
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) { const d = Math.hypot(x, y); if (d <= 2.2) pc.set(cx + x, cy + y, d > 1.5 ? GL[1] : d > 0.7 ? GL[2] : GL[3]); }
    };
    knuckle(4, 4); knuckle(S - 5, 4); knuckle(4, S - 5); knuckle(S - 5, S - 5);
    // moss tuft spilling over the top-left knuckle
    const tuft = [[9, 1, 3], [10, 0, 2], [11, 1, 4], [12, 0, 3], [13, 1, 2], [8, 2, 2], [14, 1, 1]];
    for (const [x, y, len] of tuft) for (let k2 = 0; k2 < len; k2++) pc.set(x, y + k2, MS[Math.max(1, 4 - k2)]);
    pc.set(10, 4, MS[1]); pc.set(12, 4, MS[1]);
  }
  const u = toURL(pc); cache.set(k, u); return u;
}

/** Button 9-slice: 24 x 24 source, 8 px slices. */
export function buttonURL(state: 'n' | 'h' | 'p' | 'd' | 'a'): string {
  const k = 'b:' + state;
  const hit = cache.get(k); if (hit) return hit;
  const S = 24, pc = new PixelCanvas(S, S); pc.wrap = false; pc.clear();
  const base = state === 'd' ? makeRamp(0x2a2e34, 6, { spread: 0.4 }) : state === 'a' ? makeRamp(0x2a6a5a, 6, { spread: 0.6 }) : makeRamp(state === 'h' ? 0x2c5a5c : 0x203e42, 6, { spread: 0.6 });
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
    const corner = (x < 2 || x > S - 3) && (y < 2 || y > S - 3);
    if (corner && (x === 0 || x === S - 1) && (y === 0 || y === S - 1)) continue;
    if (edge) { pc.set(x, y, PAL.k); continue; }
    const pressed = state === 'p';
    let k2 = 2.6 + (tileFbm(x, y, 24, 24, 3, 2, 5) - 0.5) * 0.8;
    if (y === 1 || x === 1) k2 = pressed ? 0.6 : 4.6;
    else if (y === S - 2 || x === S - 2) k2 = pressed ? 4 : 0.8;
    else if (y === 2 || x === 2) k2 = pressed ? 1.4 : 3.6;
    if (!pressed && y > S * 0.55 && y < S - 2) k2 -= 0.5;
    pc.set(x, y, base[Math.max(0, Math.min(5, Math.round(k2)))]);
  }
  if (state === 'h' || state === 'a') for (let i = 3; i < S - 3; i++) { pc.set(i, 2, GL[state === 'a' ? 2 : 1]); pc.set(2, i, GL[1]); }
  // tiny rivets of bone in the corners
  if (state !== 'd') for (const [x, y] of [[3, 3], [S - 4, 3], [3, S - 4], [S - 4, S - 4]]) { pc.set(x, y, BN[4]); pc.set(x + 1, y + 1, BN[1]); }
  const u = toURL(pc); cache.set(k, u); return u;
}

/** tileable membrane for large backgrounds (64 x 64) */
export function bgURL(seed = 9, alpha = 236): string {
  const k = 'bg:' + seed + ':' + alpha;
  const hit = cache.get(k); if (hit) return hit;
  const pc = new PixelCanvas(32, 32);
  membrane(pc, 0, 0, 32, 32, seed, alpha);
  const u = toURL(pc); cache.set(k, u); return u;
}

/** horizontal segmented bar: frame and fill colours */
export function barURL(col: number, w = 48): string {
  const k = 'bar:' + col + ':' + w;
  const hit = cache.get(k); if (hit) return hit;
  const R = makeRamp(col, 5, { spread: 0.55 });
  const pc = new PixelCanvas(w, 6); pc.wrap = false; pc.clear();
  for (let x = 0; x < w; x++) for (let y = 0; y < 6; y++) {
    if (y === 0 || y === 5) { pc.set(x, y, PAL.k); continue; }
    pc.set(x, y, (x % 6 === 5) ? R[1] : R[y === 1 ? 4 : y === 2 ? 3 : y === 3 ? 2 : 1]);
  }
  const u = toURL(pc); cache.set(k, u); return u;
}

/** the cursor set: organic pointer, attack fang, target reticle, build placement */
export function cursorURL(kind: 'point' | 'attack' | 'target' | 'build'): string {
  const k = 'c:' + kind;
  const hit = cache.get(k); if (hit) return hit;
  const pc = new PixelCanvas(16, 16); pc.wrap = false; pc.clear();
  const rows: Record<string, string[]> = {
    point: ['k...............', 'kgk.............', 'kggk............', 'kgGgk...........', 'kgGGgk..........', 'kgGGGgk.........', 'kgGGGGgk........', 'kgGGGGGgk.......', 'kgGGGGGGgk......', 'kgGGGGkkkk......', 'kgGkGGk.........', 'kgk.kGGk........', 'kk..kGGk........', '.....kGGk.......', '.....kkk........', '................'],
    attack: ['...k........k...', '..kbk......kbk..', '..kbBk....kBbk..', '...kbBk..kBbk...', '....kbBkkBbk....', '.....kbBBbk.....', '......kbbk......', '.....kbkkbk.....', '....kbk..kbk....', '...krk....krk...', '..krRk....kRrk..', '..kkk......kkk..', '................', '................', '................', '................'],
    target: ['......kkkk......', '....kkggggkk....', '...kgk....kgk...', '..kgk......kgk..', '.kgk........kgk.', '.kg....kk....gk.', 'kg....kwwk....gk', 'kg....kwwk....gk', '.kg....kk....gk.', '.kgk........kgk.', '..kgk......kgk..', '...kgk....kgk...', '....kkggggkk....', '......kkkk......', '................', '................'],
    build: ['kkkk......kkkk..', 'kggk......kggk..', 'kgk........kgk..', 'kk..........kk..', '................', '......kk........', '.....kggk.......', '.....kggk.......', '......kk........', '................', 'kk..........kk..', 'kgk........kgk..', 'kggk......kggk..', 'kkkk......kkkk..', '................', '................'],
  };
  rows[kind].forEach((r, y) => { for (let x = 0; x < 16; x++) { const c = PAL[r[x]]; if (r[x] !== '.' && c !== undefined) pc.set(x, y, c); } });
  // upscale x2 for visibility
  const big = new PixelCanvas(32, 32); big.wrap = false; big.clear();
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const i = ((y >> 1) * 16 + (x >> 1)) * 4; if (pc.data[i + 3]) big.setRGBA(x, y, pc.data[i], pc.data[i + 1], pc.data[i + 2], pc.data[i + 3]); }
  const u = toURL(big); cache.set(k, u); return u;
}
