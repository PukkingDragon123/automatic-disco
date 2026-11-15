// The hub's 2D UI as machined and enamelled hardware, pixel art painted to each element's own size from the master
// ramps (art/palette.ts), ONE ART PIXEL = 2 SCREEN PIXELS, light from the upper left. Clean stylised pixel clusters:
// no hand-drawn marks, no noise. Each room names itself on a plate of its own: the bridge on engraved brass, the
// cargo hold on engraved steel, engineering on a hazard-striped painted plate, every other room on a pressed-steel
// enamel door plate in its colour (pinstripe, rolled rim, two screws, a glint). Also the hardware the UI is made of:
// machined push-buttons for the room selector, a screwed steel rail, toggle switches for actions, dial faces for
// gauges (their needles are separate elements, so they swing).
import { Pix } from '../../ui/machine';
import { RAMPS as R } from '../../art/palette';
import { screw, platePix, fontsReady } from '../../ui/desk/pxPanel';
import type { RoomId } from './layout';

export const K = 2;
const hash = (a: number, b: number, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const at = (r: readonly number[], i: number) => r[Math.max(0, Math.min(r.length - 1, i))];

export type PlateKind = 'brass' | 'steelPlate' | 'hazard' | 'enamel' | 'enamelTeal' | 'enamelBlue' | 'enamelRust' | 'enamelOchre' | 'enamelMed' | 'enamelBone' | 'steel';
/** each room's plate (its name tag, its callouts and its keys) */
export const ROOM_PLATE: Record<RoomId, PlateKind> = {
  bridge: 'brass', lab: 'enamelTeal', medbay: 'enamelMed', core: 'enamelBlue', quarters: 'enamel', workshop: 'enamelRust', mess: 'enamelOchre', cargo: 'steelPlate', engineering: 'hazard',
};

// ------------------------------------------------------------------ shared marks
/** a chip of enamel off a corner, down to dark iron: a lit lower-right lip */
function chip(p: Pix, x: number, y: number, E: readonly number[]) {
  for (const [i, j] of [[0, 0], [1, 0], [0, 1]]) if (p.a(x + i, y + j) > 200) p.set(x + i, y + j, R.iron[1]);
  if (p.a(x + 2, y) > 200) p.set(x + 2, y, at(E, E.length - 1)); if (p.a(x + 1, y + 1) > 200) p.set(x + 1, y + 1, at(E, E.length - 1));
}
/** the outline with chamfered corners (cleared beyond the chamfer) */
function outline(p: Pix, w: number, h: number, col: number, cham = 2) {
  for (let x = 0; x < w; x++) { p.set(x, 0, col); p.set(x, h - 1, col); }
  for (let y = 0; y < h; y++) { p.set(0, y, col); p.set(w - 1, y, col); }
  for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [w - 1, 0, -1, 1], [0, h - 1, 1, -1], [w - 1, h - 1, -1, -1]]) {
    for (let j = 0; j < cham; j++) for (let i = 0; i < cham - j; i++) p.clear(cx + sx * i, cy + sy * j);
    for (let k = 0; k <= cham; k++) p.set(cx + sx * k, cy + sy * (cham - k), col);
  }
}
/** a 1 px rim: lit top and left, shade bottom and right, inset d */
function rim(p: Pix, w: number, h: number, d: number, lit: number, dark: number) {
  for (let x = d; x < w - d; x++) { if (p.a(x, d) > 200) p.set(x, d, lit); if (p.a(x, h - 1 - d) > 200) p.set(x, h - 1 - d, dark); }
  for (let y = d; y < h - d; y++) { if (p.a(d, y) > 200) p.set(d, y, lit); if (p.a(w - 1 - d, y) > 200) p.set(w - 1 - d, y, dark); }
}
/** a domed rivet, 3 x 3, and its shadow */
function dome(p: Pix, x: number, y: number, M: readonly number[]) {
  p.set(x, y, at(M, 5)); p.set(x + 1, y, at(M, 4)); p.set(x + 2, y, at(M, 3));
  p.set(x, y + 1, at(M, 4)); p.set(x + 1, y + 1, at(M, 3)); p.set(x + 2, y + 1, at(M, 2));
  p.set(x, y + 2, at(M, 3)); p.set(x + 1, y + 2, at(M, 2)); p.set(x + 2, y + 2, at(M, 1));
  p.set(x + 3, y + 2, at(M, 0)); p.set(x + 2, y + 3, at(M, 0));
}
/** a glint: a short bright diagonal across the upper left of a glossy or polished face */
function glint(p: Pix, x: number, y: number, n: number, c: number) {
  for (let t = 0; t < n; t++) { if (p.a(x + t, y - t) > 200) p.set(x + t, y - t, c); if (t < n - 2 && p.a(x + t + 2, y - t) > 200) p.set(x + t + 2, y - t, c); }
}

// ------------------------------------------------------------------ the plates
/** a pressed-steel enamel door plate: a flat glossy field with one sheen band, a pinstripe, a rolled rim, two
 *  screws, a glint, a chip at a corner */
function enamel(w: number, h: number, seed: number, E: readonly number[], stripe: number) {
  const p = new Pix(w, h), n = E.length, base = 3;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) p.set(x, y, at(E, base + (y > 3 && y < 6 ? 1 : 0)));
  const si = 3;
  for (let x = si + 2; x < w - si - 2; x++) { p.set(x, si, stripe); p.set(x, h - 1 - si, stripe); }
  for (let y = si + 2; y < h - si - 2; y++) { p.set(si, y, stripe); p.set(w - 1 - si, y, stripe); }
  for (const [x, y] of [[si + 1, si + 1], [w - si - 2, si + 1], [si + 1, h - si - 2], [w - si - 2, h - si - 2]]) p.set(x, y, stripe);
  rim(p, w, h, 1, at(E, n - 1), at(E, 1)); rim(p, w, h, 2, at(E, base + 1), at(E, base - 1));
  outline(p, w, h, R.ink[0], 2);
  const sy = Math.round(h / 2) - 2;
  screw(p, 6, sy, seed, E); screw(p, w - 11, sy, seed + 1, E);
  glint(p, 12, Math.min(h - 4, 8), 5, at(E, n - 1));
  if (hash(seed, 3) < 0.6) chip(p, w - 6, h - 5, E); else chip(p, 3, 3, E);
  return p;
}
/** engraved metal (brass or steel): long clean brushing, an engraved double border, rivets, a glint; brass greens
 *  a little at two rivets */
function metal(w: number, h: number, seed: number, B: readonly number[], patina: boolean) {
  const p = new Pix(w, h);
  for (let y = 1; y < h - 1; y++) {
    let x = 1;
    while (x < w - 1) { const L = 10 + Math.floor(hash(x, y, seed) * 24), d = hash(x, y, seed + 1) < 0.12 ? 1 : 0; for (let i = 0; i < L && x < w - 1; i++, x++) p.set(x, y, at(B, 3 + d)); }
  }
  const e = 5;
  for (let x = e; x < w - e; x++) { p.set(x, e, B[1]); p.set(x, e + 1, at(B, 5)); p.set(x, h - 1 - e, B[1]); p.set(x, h - e, at(B, 5)); }
  for (let y = e; y < h - e; y++) { p.set(e, y, B[1]); p.set(e + 1, y, at(B, 5)); p.set(w - 1 - e, y, B[1]); p.set(w - e, y, at(B, 5)); }
  rim(p, w, h, 1, at(B, 5), B[1]); rim(p, w, h, 2, B[4], B[2]);
  outline(p, w, h, B[0], 3);
  const riv: [number, number][] = [[2, Math.round(h / 2) - 1], [w - 5, Math.round(h / 2) - 1]];
  for (let x = 10; x < w - 12; x += 16) riv.push([x, 2], [x + 8, h - 5]);
  if (patina) for (const [rx, ry] of riv.slice(0, 2)) for (const [i, j] of [[-1, 1], [3, 0], [1, 3], [-1, 2]]) if (p.a(rx + i, ry + j) > 200) p.set(rx + i, ry + j, R.teal[4]);
  for (const [x, y] of riv) dome(p, x, y, B);
  glint(p, 10, Math.min(h - 4, 9), 6, at(B, 6));
  return p;
}
/** a painted hazard plate: flat ochre paint, black-and-yellow stripes at both ends, screws, a rim, a glint */
function hazard(w: number, h: number, seed: number) {
  const O = R.ochre, p = new Pix(w, h), band = 10;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) p.set(x, y, at(O, 4 + (y > 3 && y < 6 ? 1 : 0)));
  for (let y = 1; y < h - 1; y++) for (const [a, b] of [[1, band], [w - 1 - band, w - 1]]) for (let x = a; x < b; x++) p.set(x, y, ((x + y) >> 2) & 1 ? R.ink[1] : at(O, 5));
  for (let y = 1; y < h - 1; y++) { p.set(band, y, R.ink[0]); p.set(w - 1 - band, y, R.ink[0]); }
  rim(p, w, h, 1, at(O, 6), at(O, 1));
  outline(p, w, h, R.ink[0], 2);
  screw(p, 3, 3, seed, O); screw(p, w - 8, 3, seed + 1, O); screw(p, 3, h - 8, seed + 2, O); screw(p, w - 8, h - 8, seed + 3, O);
  glint(p, band + 4, Math.min(h - 4, 8), 5, at(O, 6));
  chip(p, band + 2 + Math.floor(hash(seed, 9) * (w - 2 * band - 8)), h - 5, O);
  return p;
}

const PAINT: Record<PlateKind, (w: number, h: number, seed: number) => Pix> = {
  brass: (w, h, s) => metal(w, h, s, R.brass, true),
  steelPlate: (w, h, s) => metal(w, h, s, R.steel, false),
  hazard,
  enamel: (w, h, s) => enamel(w, h, s, R.moss, R.bone[5]),
  enamelTeal: (w, h, s) => enamel(w, h, s, R.teal, R.bone[5]),
  enamelBlue: (w, h, s) => enamel(w, h, s, R.sapphire, R.bone[5]),
  enamelRust: (w, h, s) => enamel(w, h, s, R.rust, R.bone[5]),
  enamelOchre: (w, h, s) => enamel(w, h, s, R.ochre, R.ink[1]),
  enamelMed: (w, h, s) => enamel(w, h, s, R.snow, R.stampRed[3]),
  enamelBone: (w, h, s) => enamel(w, h, s, R.bone, R.sapphire[2]),
  steel: (w, h, s) => platePix(w, h, { mat: 'steel', seed: s, rivets: w > 60 && h > 30, wear: 0.4 }),
};

/** the plates' clearances (screws, stripes) and the lettering each takes */
const CSS = /* css */`
.pl { background-repeat: no-repeat; background-position: 0 0; image-rendering: pixelated; filter: drop-shadow(0 4px 0 rgba(10,8,6,0.5)); text-shadow: none; }
.pl-brass, .pl-steelPlate { padding: 12px 24px; color: #31260f; text-shadow: 2px 2px 0 #cea457; }
.pl-steelPlate { color: #1c1e20; text-shadow: 2px 2px 0 #b1b2aa; }
.pl-hazard { padding: 12px 32px; color: #13161c; }
.pl-enamel, .pl-enamelTeal, .pl-enamelBlue, .pl-enamelRust { padding: 10px 32px; color: #e0cfa6; text-shadow: 2px 2px 0 rgba(10,8,6,0.6); }
.pl-enamelOchre, .pl-enamelMed, .pl-enamelBone { padding: 10px 32px; color: #15264f; }
.pl-enamelMed { color: #672319; }
.pl-steel { padding: 12px 24px; color: #d6cab0; text-shadow: 2px 2px 0 #1c1e20; }
`;
let styled = false;
function style() { if (styled) return; styled = true; const e = document.createElement('style'); e.textContent = CSS; document.head.appendChild(e); }

const urls = new Map<string, string>();
const cached = (k: string, f: () => Pix) => { let u = urls.get(k); if (!u) { u = f().url(); urls.set(k, u); if (urls.size > 400) urls.delete(urls.keys().next().value as string); } return u; };
export function plateURL(kind: PlateKind, w: number, h: number, seed = 1) { return cached(`${kind}|${w}x${h}|${seed}`, () => PAINT[kind](w, h, seed)); }
/** paint an element's background as a plate, to its own size, at whole art pixels (repainted when it resizes);
 *  returns a function that stops watching it */
export function plate(el: HTMLElement, kind: PlateKind, seed = 1): () => void {
  style();
  el.classList.add('pl', 'pl-' + kind);
  let last = '';
  const apply = () => {
    if (!el.isConnected || !el.offsetWidth) return;
    const w = Math.max(10, Math.floor(el.offsetWidth / K)), h = Math.max(10, Math.floor(el.offsetHeight / K)), k = `${w}x${h}`;
    if (k === last) return; last = k;
    el.style.backgroundImage = `url(${plateURL(kind, w, h, seed)})`;
    el.style.backgroundSize = `${w * K}px ${h * K}px`;
  };
  const ro = new ResizeObserver(() => fontsReady.then(apply)); ro.observe(el);
  fontsReady.then(() => requestAnimationFrame(apply));
  return () => ro.disconnect();
}

// ------------------------------------------------------------------ hardware
/** a screwed, machined steel rail (behind the room selector) */
export function railURL(w: number, h: number) { return cached(`rail|${w}x${h}`, () => platePix(w, h, { mat: 'steel', seed: 5, rivets: false, wear: 0.2 })); }
/** a machined push-button, 24 x 26: a knurled bezel ring, a face that stands proud (up), lights (hi) or sits sunk
 *  and darker with no skirt (down) */
export function buttonURL(state: 'up' | 'hi' | 'down') {
  return cached('btn|' + state, () => {
    const S = R.steel, W = 24, H = 26, p = new Pix(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p.set(x, y, S[2]);
    for (let x = 2; x < W - 2; x += 2) p.set(x, 1, S[4]);
    rim(p, W, H, 0, S[5], S[0]); rim(p, W, H, 1, S[4], S[1]);
    outline(p, W, H, R.ink[0], 2);
    for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) p.set(x, y, R.ink[0]);
    const down = state === 'down', F = state === 'hi' ? [S[3], S[4], S[5], S[6]] : down ? [S[1], S[2], S[3], S[4]] : [S[2], S[3], S[4], S[5]];
    const y0 = down ? 6 : 5, y1 = H - (down ? 6 : 8);
    for (let y = y0; y <= y1; y++) for (let x = 5; x < W - 5; x++) p.set(x, y, F[1]);
    for (let x = 5; x < W - 5; x++) { p.set(x, y0, F[3]); p.set(x, y1, F[0]); }
    for (let y = y0; y <= y1; y++) { p.set(5, y, F[2]); p.set(W - 6, y, F[0]); }
    if (!down) for (let y = y1 + 1; y < H - 5; y++) for (let x = 5; x < W - 5; x++) p.set(x, y, S[1]);
    p.set(7, y0 + 1, F[3]); p.set(8, y0 + 1, F[3]); p.set(7, y0 + 2, F[3]);
    return p;
  });
}
/** a toggle switch, 10 x 16: a screwed base plate, a chrome lever with a ball tip, thrown up or down */
export function toggleURL(down: boolean) {
  return cached('tgl|' + down, () => {
    const S = R.steel, W = 10, H = 16, p = new Pix(W, H);
    for (let y = 3; y < 13; y++) for (let x = 1; x < 9; x++) p.set(x, y, S[2]);
    for (let x = 1; x < 9; x++) { p.set(x, 3, S[4]); p.set(x, 12, S[0]); }
    for (let y = 3; y < 13; y++) { p.set(1, y, S[4]); p.set(8, y, S[0]); }
    p.set(4, 4, S[5]); p.set(5, 11, S[5]);
    for (let y = 7; y < 9; y++) for (let x = 3; x < 7; x++) p.set(x, y, R.ink[0]);
    const tip = down ? 13 : 1, dir = down ? 1 : -1;
    for (let t = 0; t < 6; t++) { const y = 8 + dir * t; p.set(4, y, S[5]); p.set(5, y, S[3]); }
    for (let i = 3; i < 7; i++) { p.set(i, tip, S[6]); p.set(i, tip + 1, S[4]); }
    return p;
  });
}
/** a small indicator lamp, 6 x 6: a steel bezel and a lit (or dark) lens */
export function lampURL(on: boolean, col: 'red' | 'green' | 'amber' = 'green') {
  return cached(`lamp|${on}|${col}`, () => {
    const p = new Pix(6, 6), S = R.steel, L = col === 'red' ? R.coral : col === 'amber' ? R.ochre : R.malachite;
    for (const [x, y] of [[1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [0, 2], [0, 3], [0, 4], [5, 1], [5, 2], [5, 3], [5, 4], [1, 5], [2, 5], [3, 5], [4, 5]]) p.set(x, y, y === 0 || x === 0 ? S[4] : S[1]);
    for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) p.set(x, y, on ? at(L, L.length - 2) : R.ink[1]);
    p.set(1, 1, on ? at(L, L.length - 1) : S[1]);
    return p;
  });
}
/** a gauge face, 28 x 20 (a half dial): a steel bezel, a cream face, tick marks, a red zone (the needle is a
 *  separate element that swings over it) */
export function dialURL() {
  return cached('dial', () => {
    const W = 28, H = 20, p = new Pix(W, H), S = R.steel, cx = 13.5, cy = 16.5;
    for (let y = 0; y < 19; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < 13.6) p.set(x, y, d > 12.4 ? (x + y < 22 ? S[5] : S[1]) : d > 11.4 ? S[2] : R.bone[5]);
    }
    for (let x = 1; x < W - 1; x++) { p.set(x, 18, S[1]); p.set(x, 17, S[2]); }
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI + (k / 8) * Math.PI, L = k % 2 ? 1.6 : 2.6;
      for (let r = 10.8 - L; r <= 10.8; r += 0.5) p.set(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), k >= 7 ? R.stampRed[3] : R.ink[1]);
    }
    p.set(13, 16, R.ink[0]); p.set(14, 16, R.ink[0]);
    return p;
  });
}
