// Hand-painted pixel-art hardware for the planner, the hotbar and the node map. Every surface is painted texel by
// texel at the art scale (1 art pixel = 2 screen pixels at 1080p) into RGBA buffers with the green machine palettes
// (src/ui/machine.ts): olive enamel housings with plate seams, countersunk screws, scratches, chipped edges and grime;
// phosphor CRT glass set in a rubber gasket and a gunmetal bezel, with scanlines and a stepped vignette; Bakelite keys;
// bat-handle toggle switches; recessed wells. Large panels are painted to their exact size (each one unique, seeded);
// small parts are 9-slice frames installed as CSS variables. Text is never painted (DOM fonts only, see V6.md).
import { Pix, metal, mixc, dv, chamfer, rivet3, screw, vent, OL, GM, BR, PH, AM, BK, RD, CR, INK } from '../machine';
import { hashf } from '../../limbo/core/rng';

/** screen pixels per art pixel */
export const SC = 2;
const cache = new Map<string, string>();
const memo = (k: string, f: () => string) => { let u = cache.get(k); if (!u) { u = f(); cache.set(k, u); } return u; };
const clampi = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------ big panels, painted to size
export interface HouseOpts { seed?: number; seams?: { x?: number[]; y?: number[] }; vents?: [number, number, number][]; tone?: 'olive' | 'gun'; wells?: [number, number, number, number][] }
/** a machine housing: enamel plates, seams, screws, worn edges, grime pooling low, cut corners and a hard outline */
export function housing(w: number, h: number, o: HouseOpts = {}): string {
  const seed = o.seed ?? 3;
  return memo(`house|${w}|${h}|${seed}|${JSON.stringify(o)}`, () => {
    const p = new Pix(w, h), R = o.tone === 'gun' ? GM : OL;
    metal(p, 0, 0, w, h, R, { seed, base: R.length * 0.5, rough: 0.55, brushed: 0.3, light: 0.55, scratches: 0.9, grime: 0.45, rust: o.tone === 'gun' ? 0 : 0.35, chips: 0.5 });
    // the cut corners and the outline
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (chamfer(x, y, w, h, 5)) p.clear(x, y);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!p.a(x, y)) continue;
      const e = !p.a(x - 1, y) || !p.a(x + 1, y) || !p.a(x, y - 1) || !p.a(x, y + 1) || x === 0 || y === 0 || x === w - 1 || y === h - 1;
      if (e) p.set(x, y, INK);
    }
    // the rolled lip: lit top and left, shadowed bottom and right, two pixels deep
    for (let x = 5; x < w - 5; x++) { p.set(x, 1, R[R.length - 2]); p.set(x, 2, R[R.length - 3]); p.set(x, h - 2, R[1]); p.set(x, h - 3, R[2]); }
    for (let y = 5; y < h - 5; y++) { p.set(1, y, R[R.length - 3]); p.set(2, y, R[R.length - 4]); p.set(w - 2, y, R[1]); p.set(w - 3, y, R[2]); }
    for (let k = 0; k < 4; k++) { p.set(1 + k, 4 - k, R[R.length - 2]); p.set(w - 2 - k, 4 - k, R[3]); p.set(1 + k, h - 5 + k, R[3]); p.set(w - 2 - k, h - 5 + k, R[1]); }
    // edge wear: the paint rubbed through to steel along the lip, in short runs
    for (let i = 0; i < (w + h) / 3; i++) {
      const t = hashf(i, 1, seed + 5), len = 2 + Math.floor(hashf(i, 2, seed + 5) * 6), side = Math.floor(hashf(i, 3, seed + 5) * 4);
      for (let k = 0; k < len; k++) {
        const x = side < 2 ? Math.floor(6 + t * (w - 12)) + k : side === 2 ? 3 : w - 4, y = side < 2 ? (side === 0 ? 3 : h - 4) : Math.floor(6 + t * (h - 12)) + k;
        if (p.a(x, y)) p.set(x, y, side === 0 || side === 2 ? GM[7] : GM[5]);
      }
    }
    // plate seams: a dark groove with a lit far edge, screws along them
    for (const sx of o.seams?.x ?? []) {
      for (let y = 4; y < h - 4; y++) { p.set(sx, y, INK); p.set(sx + 1, y, R[R.length - 3]); p.shade(sx - 1, y, 0.78); }
      for (let y = 14; y < h - 14; y += 46) screw(p, sx - 2, y, sx * 7 + y, R === OL ? BR : GM);
    }
    for (const sy of o.seams?.y ?? []) {
      for (let x = 4; x < w - 4; x++) { p.set(x, sy, INK); p.set(x, sy + 1, R[R.length - 3]); p.shade(x, sy - 1, 0.78); }
      for (let x = 18; x < w - 18; x += 64) rivet3(p, x, sy - 4, GM);
    }
    // corner screws
    for (const [x, y] of [[6, 6], [w - 11, 6], [6, h - 11], [w - 11, h - 11]]) screw(p, x, y, x * 3 + y + seed, R === OL ? BR : GM);
    for (const [x, y, n] of o.vents ?? []) vent(p, x, y, 18, n, R === OL ? OL : GM);
    // recessed wells (where glass, keys and switches sit): a soot ring around each
    for (const [x, y, ww, hh] of o.wells ?? []) {
      for (let j = -2; j <= hh + 1; j++) for (let i = -2; i <= ww + 1; i++) { if (i >= 0 && j >= 0 && i < ww && j < hh) continue; p.shade(x + i, y + j, i < 0 || j < 0 ? 0.62 : 0.8); }
    }
    return p.url();
  });
}

/** phosphor glass: a rubber gasket, a gunmetal bezel, the glass with a stepped vignette, scanlines and a glare */
export function glass(w: number, h: number, seed = 1, tint: 'g' | 'a' = 'g'): string {
  return memo(`glass|${w}|${h}|${seed}|${tint}`, () => {
    const p = new Pix(w, h), G = tint === 'a' ? AM : PH;
    const B = 4; // bezel width
    // bezel: gunmetal, lit top-left, a screw in each corner
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (chamfer(x, y, w, h, 3)) continue;
      const v = 4 + (hashf(x, y, seed) - 0.5) * 0.9 - (x + y) / (w + h) * 1.4;
      p.set(x, y, dv(GM, v, x, y));
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (p.a(x, y) && (!p.a(x - 1, y) || !p.a(x, y - 1) || !p.a(x + 1, y) || !p.a(x, y + 1) || x === 0 || y === 0 || x === w - 1 || y === h - 1)) p.set(x, y, INK);
    for (let x = 3; x < w - 3; x++) { p.set(x, 1, GM[7]); p.set(x, h - 2, GM[2]); }
    for (let y = 3; y < h - 3; y++) { p.set(1, y, GM[6]); p.set(w - 2, y, GM[2]); }
    // the gasket and the glass
    const x0 = B, y0 = B, x1 = w - B - 1, y1 = h - B - 1, r = 5;
    const inside = (x: number, y: number, rr: number) => { const cx = clampi(x, x0 + rr, x1 - rr), cy = clampi(y, y0 + rr, y1 - rr); return (x - cx) ** 2 + (y - cy) ** 2 <= rr * rr + 0.5 && x >= x0 && x <= x1 && y >= y0 && y <= y1; };
    const W = x1 - x0, H = y1 - y0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!inside(x, y, r)) continue;
      const edge = !inside(x - 1, y, r) || !inside(x + 1, y, r) || !inside(x, y - 1, r) || !inside(x, y + 1, r);
      if (edge) { p.set(x, y, INK); continue; }
      const e2 = !inside(x - 2, y, r) || !inside(x + 2, y, r) || !inside(x, y - 2, r) || !inside(x, y + 2, r);
      if (e2) { p.set(x, y, y < y0 + 3 || x < x0 + 3 ? 0x0b0c0d : 0x1a1c1e); continue; }
      // stepped vignette: distance to the nearest edge in four bands, dithered only where bands meet
      const dx = Math.min(x - x0, x1 - x) / Math.max(1, W * 0.5), dy = Math.min(y - y0, y1 - y) / Math.max(1, H * 0.5);
      const d = Math.min(dx * 1.4, dy * 1.8, 1);
      let v = 1.1 + d * 1.25 + (hashf(x >> 2, y >> 2, seed + 9) - 0.5) * 0.18;
      // scanline: every other row a step darker
      if (((y - y0) & 1) === 1) v -= 0.55;
      p.set(x, y, dv(G, v, x, y));
    }
    // the glare: a soft diagonal sheet in the upper left, painted as sparse lit pixels
    for (let y = y0 + 3; y < y0 + H * 0.45; y++) for (let x = x0 + 3; x < x0 + W * 0.5; x++) {
      const t = (x - x0) / W + (y - y0) / H;
      if (t > 0.18 && t < 0.3 && hashf(x, y, seed + 3) < 0.22 * (1 - Math.abs(t - 0.24) / 0.06) && p.a(x, y)) p.set(x, y, mixc(p.get(x, y), G[6], 0.35));
    }
    // corner screws on the bezel
    if (w > 60 && h > 40) for (const [sx, sy] of [[1, 1], [w - 4, 1], [1, h - 4], [w - 4, h - 4]]) { p.set(sx + 1, sy + 1, GM[8]); p.set(sx + 2, sy + 1, GM[5]); p.set(sx + 1, sy + 2, GM[3]); }
    return p.url();
  });
}

/** a recessed well (hotbar slots, icon windows): dark floor, shadowed top-left wall, lit bottom-right lip */
export function wellArt(w: number, h: number, seed = 2, empty = false): string {
  return memo(`well|${w}|${h}|${seed}|${empty}`, () => {
    const p = new Pix(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (chamfer(x, y, w, h, 2)) continue;
      const o = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (o === 0) p.set(x, y, INK);
      else if (o === 1) p.set(x, y, x >= w - 2 || y >= h - 2 ? GM[6] : GM[1]);
      else if (o === 2) p.set(x, y, x >= w - 3 || y >= h - 3 ? GM[3] : INK);
      else {
        let v = 1.3 + (hashf(x >> 1, y >> 1, seed) - 0.5) * 0.4 - (o < 5 ? (5 - o) * 0.18 : 0);
        if (empty && ((x + y) >> 2) % 2 === 0) v -= 0.5;
        if ((y & 1) === 1) v -= 0.3;
        p.set(x, y, dv(PH, v, x, y));
      }
    }
    return p.url();
  });
}

/** Calder's drafting paper: off-white stock with a blue-line grid, fibres, a darker deckle edge and a strip of tape */
export function paper(w: number, h: number, seed = 4): string {
  return memo(`paper|${w}|${h}|${seed}`, () => {
    const p = new Pix(w, h), P = [0x8c8471, 0xa29d8c, 0xbdb59f, 0xc9c1aa, 0xd2cab4, 0xd9d2bf, 0xe2dbc6];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = Math.min(x, y, w - 1 - x, h - 1 - y);
      let v = 5 + (hashf(x >> 1, y, seed) - 0.5) * 0.9 - (o < 3 ? (3 - o) * 0.6 : 0) - (y / h) * 0.5;
      if (hashf(x, y >> 2, seed + 7) < 0.012) v -= 1.2; // a fibre
      let c = dv(P, v, x, y);
      if ((x - 3) % 8 === 0 || (y - 5) % 8 === 0) c = mixc(c, 0x9fb4c2, 0.45);
      p.set(x, y, c);
    }
    for (let x = 0; x < w; x++) { p.set(x, 0, P[1]); p.set(x, h - 1, CR[0]); }
    for (let y = 0; y < h; y++) { p.set(0, y, P[2]); p.set(w - 1, y, CR[0]); }
    // the tape: translucent, frayed ends, over the top edge
    const tx = Math.floor(w / 2) - 18;
    for (let y = -3; y < 6; y++) for (let x = 0; x < 36; x++) {
      if ((x < 2 || x > 33) && hashf(x, y, seed + 2) < 0.5) continue;
      const X = tx + x + Math.round(y * 0.15), Y = y + 3; if (Y < 0) continue;
      const c = p.get(X, Y); if (c < 0) continue;
      p.set(X, Y, mixc(c, 0xe8e0b8, 0.55));
    }
    return p.url();
  });
}

// ------------------------------------------------------------------ 9-slice frames (CSS border-image)
/** a phosphor frame drawn on the glass: 1 px line, cut corners, an inner glow pixel row, optional fill */
function phFrame(line: number, glow: number, fill: number | null, dim = false): string {
  const S = 12, p = new Pix(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (chamfer(x, y, S, S, 2)) continue;
    const o = Math.min(x, y, S - 1 - x, S - 1 - y);
    if (o === 0) p.set(x, y, line);
    else if (o === 1) p.set(x, y, glow, dim ? 60 : 110);
    else if (fill !== null) p.set(x, y, fill, (y & 1) ? 200 : 235);
  }
  // corner ticks: the frame reads as drawn by the beam, brighter where strokes meet
  for (const [x, y] of [[2, 0], [0, 2], [S - 3, 0], [S - 1, 2], [2, S - 1], [0, S - 3], [S - 3, S - 1], [S - 1, S - 3]]) p.set(x, y, mixc(line, 0xffffff, 0.25));
  return p.url();
}
/** a Bakelite key in a steel bezel, 9-sliced: n normal, h hover, p pressed (or on), d dead */
function keyArt(st: 'n' | 'h' | 'p' | 'd'): string {
  const S = 16, p = new Pix(S, S), pressed = st === 'p', dead = st === 'd';
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (chamfer(x, y, S, S, 2)) continue;
    const o = Math.min(x, y, S - 1 - x, S - 1 - y);
    if (o === 0) p.set(x, y, INK);
    else if (o === 1) p.set(x, y, x === S - 2 || y === S - 2 ? GM[6] : GM[2]);
    else if (o === 2) p.set(x, y, INK);
  }
  const face = dead ? BK.map((c) => mixc(c, 0x1c1c1a, 0.5)) : st === 'h' ? BK.map((c, i) => mixc(c, GM[Math.min(9, i + 3)], 0.16)) : BK;
  const k = pressed ? 1 : 0, a = 3 + k, b = S - 4 + k;
  for (let y = a; y <= b; y++) for (let x = a; x <= b; x++) {
    if ((x === a || x === b) && (y === a || y === b)) continue;
    let v = 2.6 + (hashf(x, y, 7) - 0.5) * 0.5 - (pressed ? 0.6 : 0);
    if (y === a || x === a) v = pressed ? 1.6 : 5.3; else if (y === b || x === b) v = pressed ? 3 : 0.4;
    p.set(x, y, dv(face, v, x, y));
  }
  return p.url();
}
/** a bat-handle toggle on a small plate (art 20 x 14) */
function toggleArt(on: boolean): string {
  const W = 20, H = 14, p = new Pix(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (chamfer(x, y, W, H, 2)) continue;
    const o = Math.min(x, y, W - 1 - x, H - 1 - y);
    p.set(x, y, o === 0 ? INK : o === 1 ? (x === 1 || y === 1 ? GM[7] : GM[3]) : dv(GM, 4.3 + (hashf(x, y, 3) - 0.5) * 0.7, x, y));
  }
  // the slot and the nut
  for (let x = 6; x < 14; x++) { p.set(x, 6, INK); p.set(x, 7, GM[1]); }
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) p.set(8 + i, 5 + j, i === 0 || j === 0 ? GM[8] : i === 3 || j === 3 ? GM[2] : GM[5]);
  // the bat handle leaning to its side
  const dir = on ? 1 : -1;
  for (let t = 0; t < 6; t++) { const x = 10 + dir * Math.round(t * 0.9), y = 6 - Math.round(t * 0.5); p.set(x, y, t > 3 ? GM[9] : GM[7]); p.set(x, y + 1, GM[3]); }
  p.set(10 + dir * 5, 3, GM[9]); p.set(10 + dir * 6, 3, GM[8]);
  // the pilot lamp
  const L = on ? [AM[5], AM[7]] : [GM[2], GM[3]];
  p.set(on ? 15 : 3, 3, L[1]); p.set(on ? 16 : 4, 3, L[0]); p.set(on ? 15 : 3, 4, L[0]); p.set(on ? 16 : 4, 4, L[0]);
  return p.url();
}
/** a square indicator lamp (art 5 x 5): g green, a amber, r red, o off */
function lampArt(c: 'g' | 'a' | 'r' | 'o'): string {
  const R = c === 'g' ? PH : c === 'a' ? AM : c === 'r' ? RD : GM.slice(0, 5);
  const p = new Pix(5, 5), m = R.length;
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    const o = Math.min(x, y, 4 - x, 4 - y);
    p.set(x, y, o === 0 ? INK : x === 1 && y === 1 ? R[m - 1] : R[clampi(m - 3 - (x + y > 4 ? 1 : 0), 0, m - 1)]);
  }
  return p.url();
}

let installed = false;
/** the small parts as CSS variables (9-slice frames are 12 or 16 art px, sliced at 4) */
export function installHW() {
  if (installed) return; installed = true;
  const r = document.documentElement.style;
  r.setProperty('--hw-ph', `url(${phFrame(PH[6], PH[7], PH[1])})`);
  r.setProperty('--hw-ph-dim', `url(${phFrame(PH[4], PH[5], PH[1], true)})`);
  r.setProperty('--hw-ph-hi', `url(${phFrame(PH[8], PH[8], PH[3])})`);
  r.setProperty('--hw-ph-on', `url(${phFrame(PH[9], PH[8], PH[5])})`);
  r.setProperty('--hw-ph-am', `url(${phFrame(AM[6], AM[5], 0x1e160a)})`);
  r.setProperty('--hw-ph-am-on', `url(${phFrame(AM[7], AM[6], AM[3])})`);
  r.setProperty('--hw-ph-rd', `url(${phFrame(RD[6], RD[5], 0x1c0907)})`);
  r.setProperty('--hw-ph-empty', `url(${phFrame(PH[4], PH[3], null, true)})`);
  for (const st of ['n', 'h', 'p', 'd'] as const) r.setProperty('--hw-key-' + st, `url(${keyArt(st)})`);
  r.setProperty('--hw-tog-on', `url(${toggleArt(true)})`);
  r.setProperty('--hw-tog-off', `url(${toggleArt(false)})`);
  for (const c of ['g', 'a', 'r', 'o'] as const) r.setProperty('--hw-lamp-' + c, `url(${lampArt(c)})`);
}

/** paint every [data-hw] element under root to its current size (housing, glass, well); cheap when sizes hold */
export function paintHW(root: HTMLElement) {
  const els = [...root.querySelectorAll<HTMLElement>('[data-hw]')];
  if (root.dataset.hw) els.unshift(root);
  for (const e of els) {
    const W = Math.round(e.offsetWidth / SC), H = Math.round(e.offsetHeight / SC);
    if (W < 8 || H < 8) continue;
    const kind = e.dataset.hw!, seed = Number(e.dataset.seed ?? 1);
    const key = `${kind}|${W}|${H}|${seed}|${e.dataset.seams ?? ''}`;
    if (e.dataset.hwKey === key) continue;
    e.dataset.hwKey = key;
    let url = '';
    if (kind === 'house' || kind === 'gun') {
      const seams = e.dataset.seams ? JSON.parse(e.dataset.seams) as HouseOpts['seams'] : undefined;
      const wells = [...e.querySelectorAll<HTMLElement>(':scope > [data-well]')].map((c) => [Math.round(c.offsetLeft / SC), Math.round(c.offsetTop / SC), Math.round(c.offsetWidth / SC), Math.round(c.offsetHeight / SC)] as [number, number, number, number]);
      url = housing(W, H, { seed, seams, tone: kind === 'gun' ? 'gun' : 'olive', wells });
    } else if (kind === 'glass') url = glass(W, H, seed);
    else if (kind === 'glass-a') url = glass(W, H, seed, 'a');
    else if (kind === 'well') url = wellArt(W, H, seed);
    else if (kind === 'well-e') url = wellArt(W, H, seed, true);
    else if (kind === 'paper') url = paper(W, H, seed);
    e.style.backgroundImage = `url(${url})`;
    e.style.backgroundSize = `${W * SC}px ${H * SC}px`;
    e.style.backgroundRepeat = 'no-repeat';
    e.style.imageRendering = 'pixelated';
  }
}
