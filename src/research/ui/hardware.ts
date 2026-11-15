// Hand-painted pixel-art hardware for the progression screens (the program terminal, the decision console, the
// transmission box). Every frame is painted texel by texel at 1x with the machine palette (machine.ts) and shown at
// 2x through border-image, so no panel on these screens is a flat CSS rectangle:
//   cell     an etched cell on the phosphor glass: a cut groove (dark lip above, lit lip below), corner brackets
//            drawn in bright phosphor with a glint, tick marks along the edges; variants by state
//   plate    a riveted gunmetal plate with chamfered corners, scratches and four slotted screws (side hardware)
//   well     a recessed window in the plate for readouts (bezel shadow on top, lit lip below, dark glass)
//   lamp     an octagonal pilot lamp in a knurled bezel: off, red, amber, green
//   bar      a segmented phosphor bar fill (green, amber, red)
import { Pix, metal, screw, rivet3, chamfer, PH, AM, GM, RD, OL, INK, mixc } from '../../ui/machine';

const memo = new Map<string, string>();
const once = (k: string, f: () => string) => { let u = memo.get(k); if (!u) memo.set(k, (u = f())); return u; };
type Ramp = number[];
const RAMP: Record<string, Ramp> = { ph: PH, am: AM.concat([0xf6ead0, 0xfff6e0]), rd: RD.concat([0xf0c0b0, 0xfbe0d8]) };

/** an etched cell on phosphor glass; S = 22 source, slices of 8 */
function cell(tone: 'n' | 'hot' | 'dim' | 'amb' | 'red' | 'sel') {
  const S = 22, p = new Pix(S, S);
  const R = tone === 'amb' ? RAMP.am : tone === 'red' ? RAMP.rd : RAMP.ph;
  const k = tone === 'hot' || tone === 'sel' ? 2 : tone === 'dim' ? -2 : 0;
  const at = (i: number) => R[Math.max(0, Math.min(R.length - 1, i + k))];
  // the groove: two texels deep all round, chamfered corners
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (chamfer(x, y, S, S, 2)) continue;
    const o = Math.min(x, y, S - 1 - x, S - 1 - y);
    if (o === 0) p.set(x, y, x === S - 1 || y === S - 1 ? at(3) : PH[0]);
    else if (o === 1) p.set(x, y, x >= S - 2 || y >= S - 2 ? at(4) : at(1));
    else if (o === 2) p.set(x, y, PH[1], 200);
  }
  // corner brackets: 6-texel arms in bright phosphor, a glint where they meet
  const br = (cx: number, cy: number, dx: number, dy: number) => {
    for (let i = 0; i < 6; i++) { p.set(cx + dx * i, cy, at(i < 2 ? 8 : 6)); p.set(cx, cy + dy * i, at(i < 2 ? 8 : 6)); }
    p.set(cx, cy, at(9)); p.set(cx + dx, cy + dy, at(5));
  };
  br(3, 3, 1, 1); br(S - 4, 3, -1, 1); br(3, S - 4, 1, -1); br(S - 4, S - 4, -1, -1);
  // ticks along the edges (they repeat with the edge slices)
  for (const t of [10, 12]) { p.set(t, 3, at(4)); p.set(t, S - 4, at(4)); p.set(3, t, at(4)); p.set(S - 4, t, at(4)); }
  if (tone === 'sel') for (let i = 8; i < S - 8; i++) { p.set(i, 2, at(7)); p.set(i, S - 3, at(7)); p.set(2, i, at(7)); p.set(S - 3, i, at(7)); }
  return p.url();
}
/** a riveted gunmetal plate (32 source, slices of 12) */
function plate(tone: 'gun' | 'olive') {
  const S = 32, p = new Pix(S, S), R = tone === 'gun' ? GM : OL;
  metal(p, 0, 0, S, S, R, { seed: tone === 'gun' ? 31 : 37, base: R.length * 0.5, rough: 0.5, scratches: 1.4, light: 0.5, chips: 0.6, grime: 0.4 });
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (chamfer(x, y, S, S, 3)) p.clear(x, y);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!p.a(x, y)) continue;
    if (!p.a(x - 1, y) || !p.a(x, y - 1) || x === 0 || y === 0) p.set(x, y, R[R.length - 2]);
    if (!p.a(x + 1, y) || !p.a(x, y + 1) || x === S - 1 || y === S - 1) p.set(x, y, INK);
  }
  for (let i = 3; i < S - 3; i++) { p.set(i, 1, R[R.length - 3]); p.set(1, i, R[R.length - 4]); p.set(i, S - 2, R[1]); p.set(S - 2, i, R[1]); }
  for (const [x, y] of [[3, 3], [S - 8, 3], [3, S - 8], [S - 8, S - 8]]) screw(p, x, y, x * 7 + y, GM);
  for (const t of [14, 17]) { rivet3(p, t, 3, GM); rivet3(p, t, S - 7, GM); }
  // the middle is left clear: the panel's own background shows through
  for (let y = 12; y < S - 12; y++) for (let x = 12; x < S - 12; x++) p.clear(x, y);
  return p.url();
}
/** a recessed readout window (18 source, slices of 6) */
function well(tone: 'ph' | 'am') {
  const S = 18, p = new Pix(S, S), G = tone === 'am' ? AM : PH;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (chamfer(x, y, S, S, 2)) continue;
    const o = Math.min(x, y, S - 1 - x, S - 1 - y);
    if (o === 0) p.set(x, y, x === S - 1 || y === S - 1 ? GM[7] : GM[1]);
    else if (o === 1) p.set(x, y, x >= S - 2 || y >= S - 2 ? GM[5] : GM[2]);
    else if (o === 2) p.set(x, y, INK);
    else p.set(x, y, mixc(G[1], 0, 0.3));
  }
  for (let i = 3; i < S - 3; i++) { p.set(i, 3, mixc(G[1], 0, 0.6)); p.set(3, i, mixc(G[1], 0, 0.5)); }
  for (let y = 6; y < S - 6; y++) for (let x = 6; x < S - 6; x++) p.clear(x, y);
  return p.url();
}
/** an octagonal pilot lamp, 24 x 24 */
function lamp(c: 'off' | 'red' | 'amb' | 'grn') {
  const S = 24, p = new Pix(S, S), R = c === 'red' ? RD : c === 'amb' ? AM : c === 'grn' ? PH : GM;
  const oct = (x: number, y: number, r: number) => Math.abs(x) + Math.abs(y) * 0.4 <= r * 1.1 && Math.abs(x) <= r && Math.abs(y) <= r && Math.abs(x) * 0.4 + Math.abs(y) <= r * 1.1;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - 11.5, dy = y - 11.5;
    if (!oct(dx, dy, 11.5)) continue;
    if (!oct(dx, dy, 9.5)) { p.set(x, y, ((x + y) & 1) ? GM[6] : GM[3]); continue; } // knurled bezel
    if (!oct(dx, dy, 8.5)) { p.set(x, y, INK); continue; }
    const lit = c !== 'off', v = lit ? (dy < -3 ? 6 : dy < 2 ? 5 : 4) : (dy < -3 ? 3 : 2);
    p.set(x, y, R[Math.min(R.length - 1, v)]);
  }
  // the glass: a hard glint upper left, a shadow crescent lower right
  for (const [x, y] of [[8, 7], [9, 7], [8, 8], [10, 6]]) p.set(x, y, c === 'off' ? GM[7] : 0xfff4e8);
  for (const [x, y] of [[15, 16], [16, 15], [14, 17]]) p.set(x, y, mixc(R[2], 0, 0.4));
  return p.url();
}
/** segmented fill for a bar */
function bar(c: 'grn' | 'amb' | 'red') {
  const R = c === 'amb' ? AM : c === 'red' ? RD : PH, w = 8, h = 8, p = new Pix(w, h);
  const top = R[c === 'grn' ? 9 : 7], mid = R[c === 'grn' ? 8 : 6], low = R[c === 'grn' ? 6 : 4];
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    if (x >= 6) { p.set(x, y, mixc(low, 0, 0.6)); continue; }
    p.set(x, y, y === 0 ? top : y < 4 ? mid : low);
  }
  return p.url();
}

/** set the CSS variables the progression screens use (idempotent) */
let done = false;
export function installHardware() {
  if (done) return; done = true;
  const r = document.documentElement.style;
  for (const t of ['n', 'hot', 'dim', 'amb', 'red', 'sel'] as const) r.setProperty('--hw-cell-' + t, `url(${once('cell' + t, () => cell(t))})`);
  r.setProperty('--hw-plate', `url(${once('plate-gun', () => plate('gun'))})`);
  r.setProperty('--hw-plate-ol', `url(${once('plate-ol', () => plate('olive'))})`);
  r.setProperty('--hw-well', `url(${once('well-ph', () => well('ph'))})`);
  r.setProperty('--hw-well-am', `url(${once('well-am', () => well('am'))})`);
  for (const c of ['off', 'red', 'amb', 'grn'] as const) r.setProperty('--hw-lamp-' + c, `url(${once('lamp' + c, () => lamp(c))})`);
  for (const c of ['grn', 'amb', 'red'] as const) r.setProperty('--hw-bar-' + c, `url(${once('bar' + c, () => bar(c))})`);
}

// ------------------------------------------------------------------ node sockets for the mastery tree
const nodeCache = new Map<string, HTMLCanvasElement>();
/** a perk's socket: a riveted gunmetal plate with chamfered corners, a lamp rim by state and a dark glass window for
 *  the 48 px icon (S = 56, or 62 for a capstone with a second, brass collar). Drawn at 2x on the tree. */
export function nodeFrame(st: 'owned' | 'ready' | 'ready2' | 'short' | 'locked' | 'barred' | 'hover', cap: boolean): HTMLCanvasElement {
  const key = st + (cap ? 'c' : ''); let cv = nodeCache.get(key); if (cv) return cv;
  const S = cap ? 62 : 56, o = (S - 48) / 2, p = new Pix(S, S);
  metal(p, 0, 0, S, S, GM, { seed: cap ? 71 : 67, base: GM.length * 0.42, rough: 0.5, scratches: 1.2, light: 0.6, chips: 0.5, grime: 0.5 });
  if (cap) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const e = Math.min(x, y, S - 1 - x, S - 1 - y); if (e >= 2 && e <= 3) p.set(x, y, e === 2 ? 0x93815b : 0x615439); } }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (chamfer(x, y, S, S, 4)) p.clear(x, y);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!p.a(x, y)) continue;
    const up = !p.a(x, y - 1) || y === 0, lf = !p.a(x - 1, y) || x === 0, dn = !p.a(x, y + 1) || y === S - 1, rt = !p.a(x + 1, y) || x === S - 1;
    if (dn || rt) p.set(x, y, INK); else if (up || lf) p.set(x, y, GM[8]);
  }
  // the lamp rim round the window, by state
  const rim = st === 'owned' ? [AM[6], AM[4]] : st === 'ready' ? [PH[8], PH[6]] : st === 'ready2' ? [PH[9], PH[7]] : st === 'hover' ? [PH[9], PH[8]] : st === 'short' ? [PH[5], PH[4]] : st === 'barred' ? [RD[4], RD[2]] : [GM[3], GM[2]];
  for (let i = o - 2; i < S - o + 2; i++) { p.set(i, o - 2, rim[0]); p.set(o - 2, i, rim[0]); p.set(i, S - o + 1, rim[1]); p.set(S - o + 1, i, rim[1]); }
  for (let i = o - 1; i < S - o + 1; i++) { p.set(i, o - 1, INK); p.set(o - 1, i, INK); p.set(i, S - o, GM[5]); p.set(S - o, i, GM[5]); }
  // the window: dark glass with a faint scanline every other row and a glare in the top-left corner
  const glass = st === 'locked' || st === 'barred' ? PH[0] : PH[1];
  for (let y = o; y < S - o; y++) for (let x = o; x < S - o; x++) p.set(x, y, (y & 1) ? glass : mixc(glass, 0, 0.25));
  for (let k = 0; k < 6; k++) p.set(o + 1 + k, o + 1, mixc(glass, 0xffffff, 0.12)), p.set(o + 1, o + 1 + k, mixc(glass, 0xffffff, 0.1));
  // four slotted screws and, on owned sockets, a lit pilot lamp in the corner
  for (const [x, y] of [[2, 2], [S - 7, 2], [2, S - 7], [S - 7, S - 7]]) screw(p, x, y, x * 3 + y, GM);
  if (st === 'owned') { p.rect(S - 7, 2, 4, 4, AM[6]); p.set(S - 7, 2, 0xfff4d8); p.hl(S - 7, S - 4, 6, AM[2]); }
  cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const g = cv.getContext('2d')!, img = g.createImageData(S, S); img.data.set(p.d); g.putImageData(img, 0, 0);
  nodeCache.set(key, cv);
  return cv;
}
