// The stores' hardware, hand-pixelled in code at art resolution and shown at a whole-number scale (--ik): worn
// olive enamel panels with a steel rim, seams, rivet rows, corner screws, scratches, chips, grime and rust; phosphor
// glass for the grids with a recessed steel socket per cell, scanlines and a warm glow; Bakelite keys in steel
// bezels; recessed wells. Built from the machine kit's own helpers (ui/machine.ts), cached by size.
import { Pix, OL, GM, PH, AM, BK, metal, well, rivet, screw, hazard, vent, mixc } from '../machine';
import { LOGOS } from '../../inv/logos';

const cache = new Map<string, string>();
const memo = (k: string, f: () => Pix) => { let u = cache.get(k); if (!u) { u = f().url(); cache.set(k, u); } return u; };
const h1 = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };

/** a steel rim round a w x h panel: ink outline, a lit top-left lip, a shadowed bottom-right, an inner seam */
function rim(p: Pix, x: number, y: number, w: number, h: number, R = GM) {
  p.hl(x, x + w - 1, y, R[0]); p.hl(x, x + w - 1, y + h - 1, R[0]); p.vl(x, y, y + h - 1, R[0]); p.vl(x + w - 1, y, y + h - 1, R[0]);
  for (let k = 1; k <= 2; k++) {
    p.hl(x + k, x + w - 1 - k, y + k, R[k === 1 ? 7 : 6]); p.vl(x + k, y + k, y + h - 1 - k, R[k === 1 ? 6 : 5]);
    p.hl(x + k, x + w - 1 - k, y + h - 1 - k, R[k === 1 ? 2 : 3]); p.vl(x + w - 1 - k, y + k, y + h - 1 - k, R[k === 1 ? 2 : 3]);
  }
  p.hl(x + 3, x + w - 4, y + 3, R[1]); p.vl(x + 3, y + 3, y + h - 4, R[1]);
  p.hl(x + 3, x + w - 4, y + h - 4, R[5]); p.vl(x + w - 4, y + 3, y + h - 4, R[5]);
  // wear on the rim where hands go: bright nicks along the top, a dent on the left
  for (let i = 0; i < Math.floor(w / 23); i++) { const xx = x + 6 + Math.floor(h1(i, w) * (w - 12)); p.set(xx, y + 1, R[9]); p.set(xx + 1, y + 1, R[8]); }
  p.set(x + 1, y + Math.floor(h * 0.4), R[3]); p.set(x + 1, y + Math.floor(h * 0.4) + 1, R[2]);
}
/** a stencilled program shield, sprayed, in a corner */
function stencil(p: Pix, x: number, y: number, c: number, a = 150) {
  const g = LOGOS.unaa;
  for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) if (g[j][i] === '#' && h1(i * 13 + j, 5) > 0.12) p.set(x + i, y + j, c, a);
}

/** a window panel, w x h art pixels: an olive enamel body inside a steel rim, a head band (hh tall) of gunmetal with
 *  a seam and a rivet row under it, screws in the corners, hazard paint on the foot corners, a sprayed stencil */
export function panelURL(w: number, h: number, hh: number, seed = 3): string {
  return memo(`panel:${w}x${h}:${hh}:${seed}`, () => {
    const p = new Pix(w, h);
    metal(p, 0, 0, w, h, OL, { seed, base: 4.4, rough: 0.7, brushed: 0.2, scratches: 0.7, grime: 0.5, rust: 0.3, chips: 0.7 });
    if (hh > 0) {
      metal(p, 3, 3, w - 6, hh, GM, { seed: seed + 5, base: 3.6, rough: 0.7, brushed: 0.6, scratches: 0.9, grime: 0.3, rust: 0.1, chips: 0.4 });
      p.hl(3, w - 4, hh + 3, GM[0]); p.hl(3, w - 4, hh + 4, OL[6]);
      for (let x = 14; x < w - 14; x += 22) rivet(p, x, hh + 7, OL);
    }
    rim(p, 0, 0, w, h);
    for (const [x, y] of [[5, 5], [w - 12, 5], [5, h - 12], [w - 12, h - 12]]) screw(p, x, y, x + y + seed, GM);
    hazard(p, 14, h - 9, 26, 4, seed); hazard(p, w - 40, h - 9, 26, 4, seed + 1, true);
    stencil(p, w - 30, h - 26, OL[7]);
    // a drip of grime from the head band's rivets, a scuffed lower band
    for (let x = 14; x < w - 14; x += 44) for (let k = 0; k < 4 + Math.floor(h1(x, 2) * 8); k++) p.shade(x + 2, hh + 12 + k, 0.86);
    for (let x = 6; x < w - 6; x++) if (h1(x >> 2, 11) < 0.35) p.shade(x, h - 6, 0.82);
    return p;
  });
}
/** phosphor glass with a socket for every cell: cols x rows cells of c art pixels inside a pad-wide bezel */
export function screenURL(cols: number, rows: number, c: number, pad = 4): string {
  return memo(`screen:${cols}x${rows}:${c}:${pad}`, () => {
    const W = cols * c + pad * 2, H = rows * c + pad * 2, p = new Pix(W, H);
    // the glass: a deep green field, brighter toward the middle in two flat steps, scanlines every other row
    p.rect(0, 0, W, H, PH[2]);
    p.rect(Math.floor(W * 0.12), Math.floor(H * 0.1), Math.floor(W * 0.76), Math.floor(H * 0.8), PH[3]);
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x++) p.shade(x, y, 0.88);
    // the sockets: a recessed steel cell with a lit lower lip, its floor the glass; a faint registration tick at each corner
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = pad + i * c + 1, y = pad + j * c + 1, s = c - 2;
      well(p, x + 1, y + 1, s - 2, s - 2, null, GM);
      p.hl(x + 1, x + s - 2, y, mixc(PH[4], PH[5], 0.5)); p.vl(x, y + 1, y + s - 2, PH[4]);
      for (const [dx, dy] of [[2, 2], [s - 4, 2], [2, s - 4], [s - 4, s - 4]]) p.set(x + dx, y + dy, PH[6]);
    }
    // the bezel: a dark steel lip all round with a screw at each corner
    for (let k = 0; k < pad; k++) {
      p.hl(k, W - 1 - k, k, k === 0 ? GM[0] : GM[k === pad - 1 ? 1 : 3]); p.vl(k, k, H - 1 - k, k === 0 ? GM[0] : GM[k === pad - 1 ? 1 : 3]);
      p.hl(k, W - 1 - k, H - 1 - k, k === 0 ? GM[0] : GM[k === pad - 1 ? 5 : 2]); p.vl(W - 1 - k, k, H - 1 - k, k === 0 ? GM[0] : GM[k === pad - 1 ? 5 : 2]);
    }
    // a glare streak across the upper left of the glass
    for (let i = 0; i < Math.min(W, H) * 0.5; i++) { const x = pad + 3 + i, y = pad + 2 + Math.floor(i * 0.35); if (x < W - pad && y < H - pad && i % 3 !== 2) p.set(x, y, PH[7], 70); }
    return p;
  });
}
/** a recessed well (search line, manifest): a dark glass floor inside a steel lip */
export function wellURL(w: number, h: number): string {
  return memo(`well:${w}x${h}`, () => {
    const p = new Pix(w, h);
    p.rect(0, 0, w, h, GM[3]);
    p.rect(2, 2, w - 4, h - 4, PH[1]);
    for (let y = 2; y < h - 2; y += 2) for (let x = 2; x < w - 2; x++) p.shade(x, y, 0.85);
    well(p, 2, 2, w - 4, h - 4, null, GM);
    p.hl(0, w - 1, 0, GM[0]); p.hl(0, w - 1, h - 1, GM[6]); p.vl(0, 0, h - 1, GM[0]); p.vl(w - 1, 0, h - 1, GM[6]);
    return p;
  });
}
/** a Bakelite key in a steel bezel as a 9-slice source (12 x 12, 4 px slices): n normal, h hover, p pressed, a active */
export function keyURL(st: 'n' | 'h' | 'p' | 'a' | 'd'): string {
  return memo('key:' + st, () => {
    const p = new Pix(12, 12), R = st === 'a' ? AM : st === 'd' ? GM : BK;
    // bezel
    p.rect(0, 0, 12, 12, GM[1]);
    p.hl(1, 10, 1, GM[st === 'p' ? 2 : 6]); p.vl(1, 1, 10, GM[st === 'p' ? 2 : 5]); p.hl(1, 10, 10, GM[st === 'p' ? 6 : 2]); p.vl(10, 1, 10, GM[st === 'p' ? 5 : 3]);
    // cap
    const b = st === 'a' ? 3 : st === 'h' ? 4 : st === 'd' ? 2 : 3;
    p.rect(2, 2, 8, 8, R[b]);
    if (st !== 'p') { p.hl(2, 9, 2, R[Math.min(R.length - 1, b + 2)]); p.vl(2, 2, 8, R[Math.min(R.length - 1, b + 1)]); p.hl(3, 9, 9, R[Math.max(0, b - 2)]); p.vl(9, 3, 9, R[Math.max(0, b - 1)]); }
    else { p.hl(2, 9, 2, R[0]); p.vl(2, 2, 9, R[1]); }
    if (st === 'h') p.set(3, 3, R[R.length - 1]);
    return p;
  });
}
/** a lamp: off / lit, 6 x 6 */
export function lampURL(on: boolean, R = AM): string {
  return memo('lamp:' + on + R[3], () => {
    const p = new Pix(6, 6);
    p.rect(0, 0, 6, 6, GM[1]); p.rect(1, 1, 4, 4, on ? R[5] : R[1]);
    if (on) { p.set(1, 1, R[7]); p.set(2, 1, R[6]); } p.hl(1, 4, 4, on ? R[4] : R[0]);
    return p;
  });
}
/** a short vent strip for the HUD panel's foot */
export function ventURL(w: number): string { return memo('vent:' + w, () => { const p = new Pix(w, 6); p.rect(0, 0, w, 6, OL[3]); vent(p, 1, 1, w - 2, Math.floor((w - 2) / 4), GM); return p; }); }
