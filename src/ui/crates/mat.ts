// The stores' materials, as clean stylised pixel art (v6 "hand-drawn is banned": no strokes, no photo noise, no
// wobble). Every container window, control and HUD badge is cut from its container's own material, painted here at
// art resolution (one art pixel = --ik screen pixels) from palette.ts ramps in chunky, readable clusters: boards with
// a few straight grain lines, knots, butt joints and nails; flat steel plates with crisp rivets; frosted plates with
// blocky rime along the seams; earth in banded strata with chunky stones; concrete pours with aggregate; corrugated
// sheet; lacquered boards; brass with engraved borders. Cells are built INTO the material (cubbies, pressed slots,
// pockets, bays, wire racks, glass ports, drawers, trays). Controls are machined parts: wooden tags with an engraved
// mark, stamped metal tabs, frosted-glass labels, push buttons, lamps, an enamel plate for the item card.
import { RAMPS } from '../../art/palette';
import type { ContainerKind } from '../../inv/kinds';

type Ramp = readonly number[];
export type Style = 'plank' | 'steel' | 'earth' | 'concrete' | 'frost' | 'pipe' | 'corr' | 'lacquer' | 'brass';
export type Ctl = 'wood' | 'metal' | 'frost';
interface MatInfo { field: string; style: Style; ctl: Ctl; R: Ramp; ink: number; light: number }
export const MAT: Record<ContainerKind, MatInfo> = {
  crate: { field: 'crate', style: 'plank', ctl: 'wood', R: RAMPS.ochre, ink: RAMPS.fur[0], light: RAMPS.ochre[6] },
  st_bin: { field: 'olive', style: 'steel', ctl: 'metal', R: RAMPS.olive, ink: RAMPS.olive[0], light: RAMPS.olive[5] },
  st_pit: { field: 'earth', style: 'earth', ctl: 'wood', R: RAMPS.soil, ink: RAMPS.soil[0], light: RAMPS.soil[6] },
  st_bunker: { field: 'concrete', style: 'concrete', ctl: 'metal', R: RAMPS.stone, ink: RAMPS.stone[0], light: RAMPS.stone[6] },
  st_freezer: { field: 'frost', style: 'frost', ctl: 'frost', R: RAMPS.steel, ink: RAMPS.slate[0], light: RAMPS.snow[5] },
  st_tank: { field: 'teal', style: 'pipe', ctl: 'metal', R: RAMPS.teal, ink: RAMPS.teal[0], light: RAMPS.teal[5] },
  silo: { field: 'corr', style: 'corr', ctl: 'metal', R: RAMPS.paper, ink: RAMPS.paper[0], light: RAMPS.paper[5] },
  st_cabinet: { field: 'lacquer', style: 'lacquer', ctl: 'wood', R: RAMPS.clay, ink: RAMPS.clay[0], light: RAMPS.clay[5] },
  st_vault: { field: 'brass', style: 'brass', ctl: 'metal', R: RAMPS.brass, ink: RAMPS.brass[0], light: RAMPS.brass[5] },
  hold: { field: 'hold', style: 'steel', ctl: 'metal', R: RAMPS.olive, ink: RAMPS.olive[0], light: RAMPS.olive[5] },
};

// ------------------------------------------------------------------ the kind icons (renders of the real models)
const imgs = new Map<string, HTMLImageElement>();
let ready: Promise<void> | null = null;
const listeners: (() => void)[] = [];
/** load the container kind icons once (public/inv/ui/kind_<kind>.png); call `onMats` to repaint when they land */
export function loadMats(): Promise<void> {
  if (ready) return ready;
  const names = ['crate', 'st_bin', 'st_pit', 'st_bunker', 'st_freezer', 'st_tank', 'silo', 'st_cabinet', 'st_vault', 'hold'].map((k) => 'kind_' + k);
  ready = Promise.all(names.map((n) => new Promise<void>((res) => { const i = new Image(); i.onload = () => { imgs.set(n, i); res(); }; i.onerror = () => res(); i.src = `/inv/ui/${n}.png`; }))).then(() => { for (const f of listeners) f(); });
  return ready;
}
export const onMats = (f: () => void) => listeners.push(f);
export const matsLoaded = () => imgs.size > 0;
export const kindIcon = (k: ContainerKind) => imgs.get('kind_' + k) ?? null;

// ------------------------------------------------------------------ a pixel pen on a canvas (art resolution)
const hx = (c: number) => '#' + c.toString(16).padStart(6, '0');
export class Pen {
  readonly c: HTMLCanvasElement; readonly x: CanvasRenderingContext2D;
  constructor(readonly w: number, readonly h: number) { this.c = document.createElement('canvas'); this.c.width = w; this.c.height = h; this.x = this.c.getContext('2d')!; this.x.imageSmoothingEnabled = false; }
  rect(x: number, y: number, w: number, h: number, c: number, a = 1) { this.x.globalAlpha = a; this.x.fillStyle = hx(c); this.x.fillRect(x, y, w, h); this.x.globalAlpha = 1; }
  px(x: number, y: number, c: number, a = 1) { this.rect(x, y, 1, 1, c, a); }
  hl(x0: number, x1: number, y: number, c: number, a = 1) { this.rect(Math.min(x0, x1), y, Math.abs(x1 - x0) + 1, 1, c, a); }
  vl(x: number, y0: number, y1: number, c: number, a = 1) { this.rect(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, c, a); }
  /** a material field cut at an offset (tiled) */
  field(name: string, x: number, y: number, w: number, h: number, ox: number, oy: number) {
    const im = fieldOf(name);
    this.x.save(); this.x.beginPath(); this.x.rect(x, y, w, h); this.x.clip();
    const iw = im.width, ih = im.height;
    for (let yy = y - (oy % ih); yy < y + h; yy += ih) for (let xx = x - (ox % iw); xx < x + w; xx += iw) this.x.drawImage(im, Math.round(xx), Math.round(yy));
    this.x.restore();
  }
  /** darken or lighten a rect (flat shading over the material) */
  shade(x: number, y: number, w: number, h: number, a: number) { this.rect(x, y, w, h, a < 0 ? 0x0a0b0d : 0xfff6dc, Math.abs(a)); }
  /** a raised bevel (1 px light top-left, dark bottom-right), or sunk */
  bevel(x: number, y: number, w: number, h: number, lt: number, dk: number, sunk = false) {
    const a = sunk ? dk : lt, b = sunk ? lt : dk;
    this.hl(x, x + w - 2, y, a); this.vl(x, y, y + h - 2, a); this.hl(x + 1, x + w - 1, y + h - 1, b); this.vl(x + w - 1, y + 1, y + h - 1, b);
  }
  /** a crisp dome rivet: 3 x 3, lit top-left, dark bottom-right, a 1 px cast shadow */
  rivet(x: number, y: number, R: Ramp) {
    this.px(x + 3, y + 1, 0x0a0b0d, 0.35); this.px(x + 3, y + 2, 0x0a0b0d, 0.35); this.px(x + 1, y + 3, 0x0a0b0d, 0.35); this.px(x + 2, y + 3, 0x0a0b0d, 0.35);
    this.rect(x, y, 3, 3, R[2]); this.px(x, y, R[R.length - 1]); this.px(x + 1, y, R[R.length - 2]); this.px(x, y + 1, R[R.length - 2]); this.px(x + 2, y + 2, R[1]); this.px(x + 1, y + 1, R[3]);
  }
  /** draw a small bitmap (rows of '#'), with an optional 1 px offset second colour (an engraving's lit lip) */
  glyph(g: string[], x: number, y: number, c: number, shadow = -1) {
    for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === '#') { if (shadow >= 0) this.px(x + i + 1, y + j + 1, shadow); }
    for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === '#') this.px(x + i, y + j, c);
  }
  url() { return this.c.toDataURL(); }
}
const h1 = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const S = RAMPS.steel, OCH = RAMPS.ochre, FUR = RAMPS.fur, SN = RAMPS.snow, RU = RAMPS.rust, BR = RAMPS.brass, TE = RAMPS.teal, WA = RAMPS.water, ST = RAMPS.stone, SO = RAMPS.soil, INK = RAMPS.ink;

// ------------------------------------------------------------------ the material fields (tileable, clean)
const FW = 192, FH = 144;
const fields = new Map<string, HTMLCanvasElement>();
/** a material field, painted once: tileable FW x FH art pixels of clean pixel clusters from palette ramps */
export function fieldOf(name: string): HTMLCanvasElement {
  let c = fields.get(name); if (c) return c;
  const p = new Pen(FW, FH);
  const P = (x: number, y: number, col: number, a = 1) => p.px(((x % FW) + FW) % FW, ((y % FH) + FH) % FH, col, a);
  switch (name) {
    case 'crate': boards(p, P, OCH, FUR, false, 12); break;
    case 'lacquer': boards(p, P, RAMPS.clay, FUR, true, 16); break;
    case 'olive': plates(p, P, RAMPS.olive, 64, 48, false); break;
    case 'hold': plates(p, P, RAMPS.olive, 48, 36, false); break;
    case 'teal': plates(p, P, TE, 64, 36, false); break;
    case 'gun': plates(p, P, S, 96, 72, true); break;
    case 'brass': plates(p, P, BR, 64, 48, true); break;
    case 'frost': frostField(p, P); break;
    case 'earth': earthField(p, P); break;
    case 'concrete': concreteField(p, P); break;
    case 'corr': corrField(p, P); break;
    default: p.rect(0, 0, FW, FH, S[3]);
  }
  fields.set(name, p.c);
  return p.c;
}
type Put = (x: number, y: number, c: number, a?: number) => void;
/** boards: a base tone per board, a lit top row and a dark seam, a few straight grain lines with one-pixel steps,
 *  knots, one butt joint per board with a nail each side */
function boards(p: Pen, P: Put, R: Ramp, D: Ramp, vertical: boolean, bw: number) {
  const n = Math.ceil((vertical ? FW : FH) / bw), L = vertical ? FH : FW;
  const at = (u: number, v: number, c: number) => (vertical ? P(v, u, c) : P(u, v, c)); // u along the board, v across
  for (let b = 0; b < n; b++) {
    const v0 = b * bw, tone = R[3 + (h1(b, 3) < 0.5 ? 0 : 1)];
    for (let v = 0; v < bw; v++) for (let u = 0; u < L; u++) at(u, v0 + v, tone);
    for (let u = 0; u < L; u++) { at(u, v0, R[5]); at(u, v0 + bw - 1, D[1]); at(u, v0 + bw - 2, R[2]); }
    for (let k = 0; k < 6; k++) { // grain: straight runs that step once
      let v = v0 + 2 + Math.floor(h1(k, b * 7 + 1) * (bw - 5)), u = Math.floor(h1(k, b * 7 + 2) * L);
      const len = 10 + Math.floor(h1(k, b * 7 + 3) * 26), step = Math.floor(len * 0.6);
      for (let i = 0; i < len; i++) { if (i === step) v += h1(k, b) < 0.5 ? 1 : -1; if (v > v0 + 1 && v < v0 + bw - 2) at(u + i, v, R[2]); }
    }
    if (h1(b, 9) < 0.6) { // a knot: a dark ring round a mid core
      const u = Math.floor(h1(b, 10) * L), v = v0 + 3 + Math.floor(h1(b, 11) * (bw - 7));
      for (const [du, dv] of [[1, 0], [2, 0], [0, 1], [3, 1], [1, 2], [2, 2]]) at(u + du, v + dv, R[1]);
      at(u + 1, v + 1, R[2]); at(u + 2, v + 1, R[2]);
    }
    const j = Math.floor(h1(b, 13) * L); // the butt joint and its nails
    for (let v = 1; v < bw - 1; v++) { at(j, v0 + v, D[1]); at(j + 1, v0 + v, R[5]); }
    for (const du of [-3, 4]) { at(j + du, v0 + 3, S[5]); at(j + du, v0 + 4, S[2]); at(j + du, v0 + bw - 5, S[5]); at(j + du, v0 + bw - 4, S[2]); }
    if (vertical) for (let u = 0; u < L; u++) at(u, v0 + 3, R[5]); // lacquer: a gloss line down each board
  }
}
/** flat plates: a tone each, a sheen band, a lit top-left edge and a dark seam, a crisp rivet at each corner;
 *  `brushed` adds machined lines */
function plates(p: Pen, P: Put, R: Ramp, pw: number, ph: number, brushed: boolean) {
  for (let py = 0; py < FH; py += ph) for (let px = 0; px < FW; px += pw) {
    const k = px / pw + (py / ph) * 7, tone = R[3 - (h1(k, 5) < 0.3 ? 1 : 0)];
    p.rect(px, py, pw, ph, tone);
    p.rect(px + 2, py + 3, pw - 4, 2, R[4], 0.45);
    if (brushed) for (let y = py + 7; y < py + ph - 2; y += 3) { const x0 = px + 2 + Math.floor(h1(y, k) * 10); p.hl(x0, x0 + pw - 16 - Math.floor(h1(y, k + 1) * 12), y, R[4], 0.3); }
    p.hl(px, px + pw - 1, py, R[Math.min(R.length - 1, 5)]); p.vl(px, py, py + ph - 1, R[Math.min(R.length - 1, 5)]);
    p.hl(px, px + pw - 1, py + ph - 1, R[0]); p.vl(px + pw - 1, py, py + ph - 1, R[0]);
    for (const [rx, ry] of [[3, 3], [pw - 6, 3], [3, ph - 6], [pw - 6, ph - 6]]) p.rivet(px + rx, py + ry, R);
  }
  void P;
}
/** frosted steel: pale plates with chunky 2 x 2 rime clusters gathered along the seams */
function frostField(p: Pen, P: Put) {
  const pw = 64, ph = 48;
  for (let py = 0; py < FH; py += ph) for (let px = 0; px < FW; px += pw) {
    p.rect(px, py, pw, ph, S[5]); p.rect(px + 2, py + 3, pw - 4, 2, SN[3], 0.6);
    p.hl(px, px + pw - 1, py, SN[4]); p.vl(px, py, py + ph - 1, SN[4]); p.hl(px, px + pw - 1, py + ph - 1, S[2]); p.vl(px + pw - 1, py, py + ph - 1, S[2]);
    for (const [rx, ry] of [[3, 3], [pw - 6, 3], [3, ph - 6], [pw - 6, ph - 6]]) p.rivet(px + rx, py + ry, S);
  }
  // rime: blocks thinning out away from each seam
  for (let y = 0; y < FH; y += 2) for (let x = 0; x < FW; x += 2) {
    const dx = Math.min(x % 64, 64 - (x % 64)), dy = Math.min(y % 48, 48 - (y % 48)), d = Math.min(dx, dy);
    const r = h1(x * 0.37 + y * 1.31, 4);
    if (r < 0.75 - d * 0.11) { const c = r < 0.3 ? SN[5] : SN[4]; P(x, y, c); P(x + 1, y, c); P(x, y + 1, c); P(x + 1, y + 1, r < 0.15 ? SN[3] : c); }
  }
}
/** earth: banded strata with stepped edges, chunky stones, dark specks */
function earthField(p: Pen, P: Put) {
  const tones = [SO[3], SO[4], SO[3], SO[2], SO[4], SO[3], SO[5], SO[3]];
  let y = 0, b = 0;
  const edge: number[][] = [];
  while (y < FH) { const hgt = 10 + Math.floor(h1(b, 2) * 10); edge.push([y, hgt]); y += hgt; b++; }
  edge.forEach(([y0, hgt], i) => {
    for (let x = 0; x < FW; x++) {
      const off = Math.floor(h1(Math.floor(x / 6), i) * 3) - 1; // a one-pixel step every six pixels
      for (let v = 0; v < hgt + 1; v++) P(x, y0 + v + off, tones[i % tones.length]);
      P(x, y0 + off, i % 2 ? SO[5] : SO[2]);
    }
  });
  for (let k = 0; k < 60; k++) { const x = Math.floor(h1(k, 21) * FW), yy = Math.floor(h1(k, 22) * FH); P(x, yy, SO[1]); P(x + 1, yy, SO[1]); }
  for (let k = 0; k < 16; k++) { // stones
    const x = Math.floor(h1(k, 31) * FW), yy = Math.floor(h1(k, 32) * FH), w = 3 + Math.floor(h1(k, 33) * 3);
    for (let i = 1; i < w - 1; i++) { P(x + i, yy, ST[5]); P(x + i, yy + 2, ST[2]); }
    for (let i = 0; i < w; i++) P(x + i, yy + 1, i === 0 ? ST[4] : i === w - 1 ? ST[2] : ST[3]);
    P(x + 1, yy + 3, SO[1]); P(x + 2, yy + 3, SO[1]);
  }
}
/** concrete: pours with a lit lip, aggregate in two-pixel blocks, a few pits */
function concreteField(p: Pen, P: Put) {
  p.rect(0, 0, FW, FH, ST[4]);
  for (let y = 0; y < FH; y += 36) { p.rect(0, y, FW, 18, ST[3], 0.35); p.hl(0, FW - 1, y, ST[2]); p.hl(0, FW - 1, y + 1, ST[5]); }
  for (let k = 0; k < 140; k++) { const x = Math.floor(h1(k, 41) * FW), y = Math.floor(h1(k, 42) * FH), c = h1(k, 43) < 0.5 ? ST[2] : ST[5]; P(x, y, c); P(x + 1, y, c); if (h1(k, 44) < 0.4) P(x, y + 1, c); }
  for (let k = 0; k < 30; k++) P(Math.floor(h1(k, 45) * FW), Math.floor(h1(k, 46) * FH), ST[1]);
}
/** corrugated sheet: an eight-pixel rib profile, a riveted lap seam */
function corrField(p: Pen, P: Put) {
  const R = RAMPS.paper, prof = [R[1], R[2], R[3], R[4], R[5], R[5], R[4], R[2]];
  for (let x = 0; x < FW; x++) p.vl(x, 0, FH - 1, prof[x % 8]);
  for (let y = 0; y < FH; y += 48) { p.hl(0, FW - 1, y, R[0]); p.hl(0, FW - 1, y + 1, R[5]); for (let x = 2; x < FW; x += 16) p.rivet(x, y + 3, S); }
  void P;
}

// ------------------------------------------------------------------ the window panel
export interface PanelLayout { w: number; h: number; head: number; gx: number; gy: number; cols: number; rows: number; cell: number; fill: number; frame: number; ctrlY: number }
/** the fill gauge's well in a panel's foot: x, y, w, h (art pixels) */
export const gaugeRect = (L: PanelLayout): [number, number, number, number] => [L.frame + 2, L.h - L.frame - 10, L.w - 2 * L.frame - 84, 7];
const cache = new Map<string, string>();
/** a container window's background, painted at art resolution and cached by kind, size and seed */
export function panelURL(kind: ContainerKind, L: PanelLayout, seed: number): string {
  const key = `${kind}|${L.w}x${L.h}|${L.cols}x${L.rows}|${Math.round(L.fill * 12)}|${seed}`;
  let u = cache.get(key); if (u) return u;
  const m = MAT[kind], p = new Pen(L.w, L.h), F = L.frame;
  p.field(m.field, 0, 0, L.w, L.h, Math.floor(h1(seed) * 64), Math.floor(h1(seed, 2) * 48));
  p.shade(F, F, L.w - 2 * F, L.head, -0.14);
  frame(p, kind, L, seed);
  cells(p, kind, L, seed);
  const [gx, gy, gw, gh] = gaugeRect(L);
  p.rect(gx, gy, gw, gh, INK[0], 0.7); p.bevel(gx, gy, gw, gh, m.ink, m.light, true);
  u = p.url(); cache.set(key, u);
  return u;
}
function frame(p: Pen, kind: ContainerKind, L: PanelLayout, seed: number) {
  const m = MAT[kind], F = L.frame, W = L.w, H = L.h;
  const outline = () => { p.hl(0, W - 1, 0, m.ink); p.hl(0, W - 1, H - 1, m.ink); p.vl(0, 0, H - 1, m.ink); p.vl(W - 1, 0, H - 1, m.ink); };
  const inner = (lt: number, dk: number) => p.bevel(F - 1, F - 1, W - 2 * F + 2, H - 2 * F + 2, dk, lt, true);
  switch (m.style) {
    case 'plank': {
      // four boards round the edge, darker posts at the corners with bolts, nails, a steel grab handle each side
      for (const [x, y, w, h] of [[0, 0, W, F], [0, H - F, W, F], [0, 0, F, H], [W - F, 0, F, H]]) { p.shade(x, y, w, h, -0.12); p.bevel(x, y, w, h, OCH[6], FUR[1]); }
      for (const [x, y] of [[0, 0], [W - F, 0], [0, H - F], [W - F, H - F]]) { p.rect(x, y, F, F, OCH[2]); p.bevel(x, y, F, F, OCH[5], FUR[0]); p.rivet(x + 2, y + 2, S); }
      for (let x = F + 14; x < W - F - 8; x += 38) { p.rivet(x, 2, S); if (x < W - 52) p.rivet(x, H - F + 2, S); }
      stencil(p, seed, W - 12, H - 7, FUR[0], 0.8, false);
      for (const side of [0, 1]) { // a recessed steel grab handle in each side board
        const x0 = side ? W - F + 1 : 1, cy = Math.floor(H / 2);
        p.rect(x0, cy - 10, F - 2, 20, FUR[0]); p.rect(x0 + 1, cy - 9, F - 4, 18, FUR[1]);
        p.rect(x0 + 2, cy - 8, 2, 16, S[4]); p.vl(x0 + 2, cy - 8, cy + 7, S[6]); p.vl(x0 + 3, cy - 8, cy + 7, S[2]);
        p.rivet(x0 + 1, cy - 13, S); p.rivet(x0 + 1, cy + 10, S);
      }
      outline(); break;
    }
    case 'steel': case 'corr': {
      p.bevel(0, 0, W, H, m.light, m.ink); p.bevel(1, 1, W - 2, H - 2, m.R[4], m.R[1]);
      inner(m.light, m.ink);
      for (let x = 10; x < W - 10; x += 18) { p.rivet(x, 3, m.R); if (x < W - 52) p.rivet(x, H - 6, m.R); }
      stencil(p, seed, W - 12, H - 7, m.style === 'corr' ? RAMPS.stampRed[2] : m.light, 0.9, m.style === 'steel');
      for (let y = 21; y < H - 12; y += 18) { p.rivet(3, y, m.R); p.rivet(W - 6, y, m.R); }
      for (const [x, y, dx, dy] of [[1, 1, 1, 1], [W - 2, 1, -1, 1], [1, H - 2, 1, -1], [W - 2, H - 2, -1, -1]]) for (let k = 0; k < 6; k++) p.hl(x, x + dx * (5 - k), y + dy * k, m.R[2]);
      break;
    }
    case 'earth': {
      // a timber-shored rim: the earth darker at the edge, a rough-sawn beam along the top, stones bedded at intervals
      p.shade(0, 0, W, F, -0.28); p.shade(0, H - F, W, F, -0.32); p.shade(0, 0, F, H, -0.28); p.shade(W - F, 0, F, H, -0.28);
      p.rect(0, 0, W, 5, OCH[2]); p.hl(0, W - 1, 0, OCH[4]); p.hl(0, W - 1, 4, FUR[0]);
      for (let x = 12; x < W - 8; x += 40) { p.rivet(x, 1, S); }
      for (let i = 0; i * 26 < W + H; i++) {
        const t = i * 26 + 9, [x, y] = t < W ? [t, H - F + 2] : [W - F + 2, t - W];
        if (y > H - 4 || x > W - 6) continue;
        p.rect(x, y, 4, 3, ST[3]); p.hl(x, x + 3, y, ST[5]); p.hl(x, x + 3, y + 2, ST[2]);
        if (y + 6 < H) { const yl = 8 + ((i * 37) % Math.max(1, H - 24)); p.rect(1, yl, 4, 3, ST[3]); p.hl(1, 4, yl, ST[5]); p.hl(1, 4, yl + 2, ST[2]); }
      }
      inner(SO[5], m.ink);
      break;
    }
    case 'concrete': {
      p.bevel(0, 0, W, H, m.R[6], m.ink); inner(m.R[6], m.ink);
      for (const [x, y, dx, dy] of [[0, 0, 1, 1], [W - 1, 0, -1, 1], [0, H - 1, 1, -1], [W - 1, H - 1, -1, -1]]) for (let k = 0; k < 4; k++) p.x.clearRect(Math.min(x, x + dx * (3 - k)), y + dy * k, 4 - k, 1);
      for (const [x, y, dx, dy] of [[3, 3, 1, 0], [W - 4, 3, 0, 1], [3, H - 4, 0, -1], [W - 4, H - 4, -1, 0]]) for (let k = 0; k < 6; k++) p.px(x + dx * k, y + dy * k, k % 2 ? RU[2] : RU[4]);
      for (let x = 24; x < W - 24; x += 48) { p.rect(x, 1, 6, 2, m.R[2]); p.rect(x, H - 3, 6, 2, m.R[2]); } // form-tie holes
      stencil(p, seed, W - 12, H - 7, m.R[1], 0.9, true);
      break;
    }
    case 'frost': {
      p.bevel(0, 0, W, H, SN[5], S[1]); p.bevel(1, 1, W - 2, H - 2, S[5], S[2]);
      inner(SN[4], S[1]);
      // rime along the top edge in blocks, icicles hanging off it, rime blocks at the corners
      for (let x = 1; x < W - 1; x += 2) { p.rect(x, 1, 2, 2, SN[5]); if (h1(x, seed) < 0.5) p.rect(x, 3, 2, 1, SN[4]); const len = h1(x, seed + 2) < 0.16 ? 2 + Math.floor(h1(x, seed + 3) * 4) : 0; if (len) { p.vl(x, 4, 3 + len, SN[5]); p.px(x, 4 + len, SN[3]); } }
      for (const [cx, cy] of [[F, F], [W - F, F], [F, H - F], [W - F, H - F]]) for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) { if (Math.abs(dx) + Math.abs(dy) > 7 || h1(dx * 3 + dy, cx + cy) < 0.3) continue; p.rect(cx + dx, cy + dy, 2, 2, Math.abs(dx) + Math.abs(dy) < 4 ? SN[5] : SN[4]); }
      for (let x = 12; x < W - 12; x += 26) p.rivet(x, H - 6, S);
      break;
    }
    case 'pipe': {
      // the frame is pipework: a pipe along each edge, flanged elbows at the corners, a sight glass on the right
      const pipe = (x: number, y: number, len: number, vert: boolean) => {
        const bands = [S[1], S[4], S[6], S[5], S[3], S[2], S[1]];
        for (let k = 0; k < 7; k++) vert ? p.rect(x + k, y, 1, len, bands[k]) : p.rect(x, y + k, len, 1, bands[k]);
      };
      pipe(0, 0, W, false); pipe(0, H - 7, W, false); pipe(0, 0, H, true); pipe(W - 7, 0, H, true);
      for (const [x, y] of [[0, 0], [W - 7, 0], [0, H - 7], [W - 7, H - 7]]) { p.rect(x, y, 7, 7, S[3]); p.bevel(x, y, 7, 7, S[6], S[1]); p.rivet(x + 2, y + 2, BR); }
      for (const x of [Math.floor(W * 0.33), Math.floor(W * 0.66)]) for (const y of [0, H - 7]) { p.rect(x, y, 4, 7, S[2]); p.bevel(x, y, 4, 7, S[5], S[0]); p.px(x + 1, y + 1, BR[5]); p.px(x + 1, y + 5, BR[5]); }
      const gx = W - 6, gy0 = 14, gy1 = H - 14, lvl = Math.round(gy1 - (gy1 - gy0) * L.fill);
      p.rect(gx, gy0, 5, gy1 - gy0, S[0]); p.rect(gx + 1, gy0 + 1, 3, gy1 - gy0 - 2, TE[1]);
      p.rect(gx + 1, lvl, 3, gy1 - lvl - 1, WA[4]); p.hl(gx + 1, gx + 3, lvl, WA[6]); p.vl(gx + 1, gy0 + 2, gy1 - 3, SN[4], 0.5);
      for (let y = gy0 + 6; y < gy1; y += 10) p.px(gx + 4, y, S[6]);
      inner(TE[4], TE[0]);
      break;
    }
    case 'lacquer': {
      p.bevel(0, 0, W, H, m.R[5], m.ink); p.hl(2, W - 3, 2, 0xfff6dc, 0.35);
      inner(m.R[4], m.ink);
      for (const [x, y, dx, dy] of [[1, 1, 1, 1], [W - 2, 1, -1, 1], [1, H - 2, 1, -1], [W - 2, H - 2, -1, -1]]) { for (let k = 0; k < 9; k++) { p.px(x + dx * k, y, BR[4]); p.px(x, y + dy * k, BR[4]); p.px(x + dx * k, y + dy, BR[2]); p.px(x + dx, y + dy * k, BR[2]); } p.rivet(x + (dx > 0 ? 2 : -4), y + (dy > 0 ? 2 : -4), BR); }
      break;
    }
    case 'brass': {
      p.bevel(0, 0, W, H, BR[5], BR[0]); p.bevel(1, 1, W - 2, H - 2, BR[4], BR[1]);
      p.rect(F - 3, F - 3, W - 2 * F + 6, 2, TE[2]); p.rect(F - 3, H - F + 1, W - 2 * F + 6, 2, TE[2]); p.rect(F - 3, F - 3, 2, H - 2 * F + 6, TE[2]); p.rect(W - F + 1, F - 3, 2, H - 2 * F + 6, TE[2]);
      for (let x = 10; x < W - 10; x += 20) { p.rivet(x, 1, BR); p.rivet(x, H - 4, BR); }
      inner(BR[5], BR[0]);
      break;
    }
  }
}
/** a stencilled serial on the bottom frame, right-aligned at x: two digits through a 3 x 5 stencil, and on steel and
 *  concrete a block of hazard chevrons before it */
const DIG = ['###|#.#|#.#|#.#|###', '.#.|##.|.#.|.#.|###', '##.|..#|.#.|#..|###', '##.|..#|.#.|..#|##.', '#.#|#.#|###|..#|..#', '###|#..|##.|..#|##.', '.##|#..|###|#.#|###', '###|..#|.#.|.#.|.#.', '###|#.#|.#.|#.#|###', '###|#.#|###|..#|##.'].map((d) => d.split('|'));
function stencil(p: Pen, n: number, x: number, y: number, c: number, a: number, hazard: boolean) {
  const t = String(n % 100).padStart(2, '0');
  let cx = x - t.length * 4 + 1;
  for (const ch of t) { const g = DIG[Number(ch)]; for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '#' && !(j === 2 && i === 1 && ch === '0')) p.px(cx + i, y + j, c, a); cx += 4; }
  if (hazard) { const hx0 = x - t.length * 4 - 16; for (let j = 0; j < 5; j++) for (let i = 0; i < 13; i++) p.px(hx0 + i, y + j, (i + j) % 6 < 3 ? RAMPS.glowAmber[3] : INK[0]); }
}
/** the cells, built into the material: one per grid position */
function cells(p: Pen, kind: ContainerKind, L: PanelLayout, seed: number) {
  const m = MAT[kind], C = L.cell;
  p.rect(L.gx - 2, L.gy - 2, L.cols * C + 4, L.rows * C + 4, INK[0], 0.35);
  p.bevel(L.gx - 2, L.gy - 2, L.cols * C + 4, L.rows * C + 4, m.ink, m.light, true);
  for (let j = 0; j < L.rows; j++) for (let i = 0; i < L.cols; i++) {
    const x = L.gx + i * C, y = L.gy + j * C, s = C;
    switch (m.style) {
      case 'plank': { // cubbies between battens: a dark hollow, the shadow under the top batten, a lit floor lip
        const ix = x + 2, iy = y + 2, n = s - 3;
        p.rect(ix, iy, n, n, FUR[1], 0.78);
        p.hl(ix, ix + n - 1, iy, FUR[0]); p.hl(ix, ix + n - 1, iy + 1, FUR[0], 0.6); p.vl(ix, iy, iy + n - 1, FUR[0], 0.7);
        p.hl(ix + 1, ix + n - 1, iy + n - 1, OCH[2]); p.vl(ix + n - 1, iy + 2, iy + n - 1, OCH[1]);
        p.rect(x, y, s, 2, OCH[3]); p.hl(x, x + s - 1, y, OCH[5]); p.rect(x, y, 2, s, OCH[3]); p.vl(x, y, y + s - 1, OCH[4]);
        if ((i + j) % 2 === 0) { p.px(x, y, S[5]); p.px(x + 1, y + 1, S[1]); }
        break;
      }
      case 'steel': case 'corr': // pressed slots with a dimple in each corner
        p.rect(x + 1, y + 1, s - 2, s - 2, m.ink, 0.62); p.bevel(x + 1, y + 1, s - 2, s - 2, m.ink, m.light, true); p.hl(x + 2, x + s - 3, y + 2, m.ink, 0.5);
        for (const [dx, dy] of [[3, 3], [s - 5, 3], [3, s - 5], [s - 5, s - 5]]) p.px(x + dx, y + dy, m.R[4]);
        break;
      case 'earth': // pockets dug in the earth: a dark hollow, a shadowed back wall, a lit front lip
        p.rect(x + 2, y + 2, s - 4, s - 4, SO[0], 0.78); p.rect(x + 2, y + 2, s - 4, 3, INK[0], 0.4);
        p.hl(x + 3, x + s - 4, y + 2, SO[1]); p.hl(x + 3, x + s - 4, y + s - 3, SO[5]); p.hl(x + 3, x + s - 4, y + s - 2, SO[4]);
        if (h1(i + j * 13, seed) < 0.4) { const sx = x + 5 + Math.floor(h1(i, j) * (s - 12)); p.rect(sx, y + s - 2, 3, 1, ST[5]); }
        break;
      case 'concrete': // bays with rebar along the joints
        p.rect(x + 2, y + 2, s - 4, s - 4, INK[0], 0.55); p.bevel(x + 2, y + 2, s - 4, s - 4, m.ink, m.R[5], true);
        for (let k = 0; k < s; k += 2) { p.px(x + k, y, k % 4 ? RU[3] : RU[2]); p.px(x, y + k, k % 4 ? RU[3] : RU[2]); }
        break;
      case 'frost': // wire racks over a cold dark well, a rime block on the top wire
        p.rect(x + 1, y + 1, s - 2, s - 2, RAMPS.slate[1]); p.rect(x + 1, y + 1, s - 2, 3, INK[0], 0.35);
        p.hl(x, x + s - 1, y, S[5]); p.vl(x, y, y + s - 1, S[5]); p.hl(x, x + s - 1, y + s - 1, S[3]);
        for (let k = 4; k < s - 4; k += 9) p.vl(x + k, y + 1, y + s - 2, S[3], 0.5);
        if ((i + j) % 3 === 0) p.rect(x + 6 + ((i * 7) % (s - 14)), y - 1, 4, 2, SN[5]);
        break;
      case 'pipe': // round-cornered glass ports
        p.rect(x + 2, y + 2, s - 4, s - 4, TE[1]); p.rect(x + 2, y + 2, s - 4, s - 4, INK[0], 0.3);
        p.bevel(x + 1, y + 1, s - 2, s - 2, S[1], S[5], true);
        for (const [cx, cy] of [[x + 1, y + 1], [x + s - 2, y + 1], [x + 1, y + s - 2], [x + s - 2, y + s - 2]]) p.px(cx, cy, S[3]);
        for (let k = 0; k < 4; k++) p.px(x + 5 + k, y + 8 - k, SN[5], 0.5);
        break;
      case 'lacquer': // glass-fronted drawers with a brass pull
        p.rect(x + 1, y + 1, s - 2, s - 2, INK[0], 0.45); p.bevel(x + 1, y + 1, s - 2, s - 2, m.ink, m.R[4], true);
        p.rect(x + 3, y + 3, s - 6, s - 9, TE[4], 0.18);
        for (let k = 0; k < 5; k++) p.px(x + 5 + k, y + 10 - k, SN[5], 0.4);
        p.rect(x + Math.floor(s / 2) - 3, y + s - 5, 6, 2, BR[4]); p.hl(x + Math.floor(s / 2) - 3, x + Math.floor(s / 2) + 2, y + s - 5, BR[5]);
        break;
      case 'brass': // enamel trays in brass rims
        p.rect(x + 2, y + 2, s - 4, s - 4, TE[1]); p.bevel(x + 1, y + 1, s - 2, s - 2, BR[1], BR[5], true);
        p.bevel(x + 2, y + 2, s - 4, s - 4, TE[0], TE[3], true);
        break;
    }
  }
}

// ------------------------------------------------------------------ small controls: machined parts in the material
/** a tab, tag or label in the container's material: w x h art pixels; state 0 idle, 1 hover, 2 active */
export function ctlURL(kind: ContainerKind, w: number, h: number, state: 0 | 1 | 2, glyph?: string[], seed = 1): string {
  const key = `ctl|${kind}|${w}x${h}|${state}|${glyph?.join('') ?? ''}|${seed}`;
  let u = cache.get(key); if (u) return u;
  const m = MAT[kind], p = new Pen(w, h);
  const gx = glyph ? Math.floor((w - glyph[0].length) / 2) : 0, gy = glyph ? Math.floor((h - glyph.length) / 2) : 0;
  if (m.ctl === 'wood') {
    // a wooden tag: a flat board, two straight grain lines, a clean bevel, the mark engraved (dark cut, lit lip)
    const R = kind === 'st_cabinet' ? RAMPS.clay : OCH;
    p.rect(0, 0, w, h, state === 2 ? R[5] : state === 1 ? R[4] : R[Math.min(R.length - 1, 4)]);
    if (state !== 2) p.rect(0, 0, w, h, R[3], 0.35);
    p.hl(1, w - 2, Math.floor(h * 0.3), R[2], 0.5); p.hl(2, w - 3, Math.floor(h * 0.75), R[2], 0.5);
    p.bevel(0, 0, w, h, R[Math.min(R.length - 1, 5)], FUR[0]); p.bevel(1, 1, w - 2, h - 2, R[5], R[2]);
    if (glyph) p.glyph(glyph, gx, gy, state === 2 ? RAMPS.stampRed[2] : FUR[0], R[5]);
  } else if (m.ctl === 'frost') {
    // a frosted-glass label in a steel bezel, the mark etched clear, a clean diagonal glint
    p.rect(0, 0, w, h, S[1]); p.rect(1, 1, w - 2, h - 2, state === 2 ? SN[5] : state === 1 ? SN[4] : SN[3]);
    for (let k = 0; k < Math.min(w, h) - 4; k++) p.px(2 + k + 2, h - 3 - k, SN[5], 0.7);
    p.bevel(0, 0, w, h, S[5], S[0]);
    if (glyph) p.glyph(glyph, gx, gy, state === 2 ? RAMPS.slate[0] : RAMPS.slate[1], SN[5]);
  } else {
    // a stamped metal tab: a flat plate, a lit edge and a dark one, two corner pins, the mark pressed in (amber when on)
    const R = state === 2 ? RAMPS.glowAmber : m.R;
    p.rect(0, 0, w, h, R[3]); if (state === 1) p.rect(0, 0, w, h, R[4], 0.4);
    p.rect(1, 1, w - 2, Math.max(1, Math.floor(h / 3)), R[4], 0.35);
    p.bevel(0, 0, w, h, R[R.length - 1], INK[0]); p.bevel(1, 1, w - 2, h - 2, R[Math.min(R.length - 1, 4)], R[1]);
    if (w > 12) { p.px(2, 2, R[1]); p.px(w - 3, 2, R[1]); }
    if (glyph) p.glyph(glyph, gx, gy, state === 2 ? INK[1] : R[1], R[R.length - 1]);
  }
  u = p.url(); cache.set(key, u);
  return u;
}
/** a chunky mechanical push button (the HUD's page keys): a steel bezel, a domed cap, an embossed arrow; pressed
 *  sinks the cap a pixel */
export function buttonURL(dir: 'l' | 'r', state: 0 | 1 | 2, off = false): string {
  const key = `btn|${dir}|${state}|${off}`; let u = cache.get(key); if (u) return u;
  const n = 16, p = new Pen(n, n), d = state === 2 ? 1 : 0;
  p.rect(0, 0, n, n, INK[0]); p.rect(1, 1, n - 2, n - 2, S[1]); p.bevel(1, 1, n - 2, n - 2, S[4], S[0]);
  const cap = off ? S[2] : state === 1 ? S[5] : S[4];
  p.rect(3, 3 + d, n - 6, n - 6 - d, cap); p.hl(3, n - 4, 3 + d, S[6]); p.vl(3, 3 + d, n - 4, S[5]); p.hl(4, n - 4, n - 4, S[2]); p.vl(n - 4, 4 + d, n - 4, S[2]);
  if (!d) p.hl(3, n - 4, n - 3, INK[0], 0.6);
  const g = dir === 'l' ? ['..#', '.##', '###', '.##', '..#'] : ['#..', '##.', '###', '##.', '#..'];
  p.glyph(g, 6 + (dir === 'l' ? 0 : 1), 5 + d, off ? S[3] : S[1], off ? -1 : S[6]);
  u = p.url(); cache.set(key, u);
  return u;
}
/** a small round indicator lamp in a steel bezel: amber when lit */
export function lampURL(on: boolean): string {
  const key = 'lamp' + on; let u = cache.get(key); if (u) return u;
  const p = new Pen(7, 7), A = RAMPS.glowAmber;
  p.rect(1, 0, 5, 7, S[1]); p.rect(0, 1, 7, 5, S[1]); p.px(1, 1, S[5]); p.px(5, 5, S[0]);
  p.rect(2, 1, 3, 5, on ? A[3] : S[2]); p.rect(1, 2, 5, 3, on ? A[3] : S[2]);
  p.px(2, 2, on ? A[4] : S[4]); if (on) { p.px(3, 2, A[4]); p.px(4, 4, A[1]); }
  u = p.url(); cache.set(key, u);
  return u;
}

// ------------------------------------------------------------------ the HUD plate and badges
/** the stores HUD's plate: machined steel, brushed, a double bevel, crisp rivets */
export function hudPlateURL(w: number, h: number): string {
  const key = `hud|${w}x${h}`; let u = cache.get(key); if (u) return u;
  const p = new Pen(w, h);
  p.rect(0, 0, w, h, S[2]);
  for (let y = 3; y < h - 3; y += 2) { const x0 = 3 + Math.floor(h1(y, 7) * 14); p.hl(x0, Math.min(w - 4, x0 + w - 30 - Math.floor(h1(y, 8) * 20)), y, S[3], 0.55); }
  p.bevel(0, 0, w, h, S[5], INK[0]); p.bevel(1, 1, w - 2, h - 2, S[4], S[1]);
  for (let x = 8; x < w - 6; x += 20) { p.rivet(x, 2, S); p.rivet(x, h - 5, S); }
  for (let y = 22; y < h - 10; y += 20) { p.rivet(2, y, S); p.rivet(w - 5, y, S); }
  u = p.url(); cache.set(key, u);
  return u;
}
/** a plain plate of a container's material (the settings plate): field and frame, no cells */
export function plainURL(kind: ContainerKind, w: number, h: number, seed: number): string {
  const key = `plain|${kind}|${w}x${h}|${seed}`; let u = cache.get(key); if (u) return u;
  const m = MAT[kind], p = new Pen(w, h);
  p.field(m.field, 0, 0, w, h, seed * 19, seed * 5);
  frame(p, kind, { w, h, head: 0, gx: 0, gy: 0, cols: 0, rows: 0, cell: 1, fill: 0, frame: 6, ctrlY: 0 }, seed);
  u = p.url(); cache.set(key, u);
  return u;
}
/** a container's badge: a plate of its own material, the render of its model, its logo in its paint, the gauge */
export function badgeURL(kind: ContainerKind, w: number, h: number, logo: string[], paint: Ramp, fill: number, seed: number): string {
  const key = `badge|${kind}|${w}x${h}|${logo.join('')}|${paint[3]}|${Math.round(fill * 20)}|${seed}|${matsLoaded()}`;
  let u = cache.get(key); if (u) return u;
  const m = MAT[kind], p = new Pen(w, h);
  p.field(m.field, 0, 0, w, h, seed * 21, seed * 11);
  p.bevel(0, 0, w, h, m.light, m.ink); p.bevel(1, 1, w - 2, h - 2, m.R[Math.min(m.R.length - 1, 5)], m.R[1]);
  p.rect(3, 3, w - 6, 42, INK[0], 0.45); p.bevel(3, 3, w - 6, 42, m.ink, m.light, true);
  const ic = kindIcon(kind); if (ic) p.x.drawImage(ic, Math.floor((w - ic.width) / 2), 4 + Math.floor((42 - ic.height) / 2));
  p.rect(w - 17, 30, 14, 14, paint[1]); p.rect(w - 16, 31, 12, 12, paint[3]);
  p.glyph(logo, w - 16, 31, paint.length > 5 ? paint[5] : paint[paint.length - 1]);
  p.rect(3, 60, w - 6, h - 70, INK[0], 0.55); p.bevel(3, 60, w - 6, h - 70, m.ink, m.light, true);
  const gy = h - 7; p.rect(3, gy, w - 6, 4, INK[0]);
  const gw = Math.round((w - 8) * Math.min(1, fill)); const G = fill > 0.9 ? RAMPS.stampRed : RAMPS.moss;
  for (let x = 0; x < gw; x++) p.vl(4 + x, gy + 1, gy + 2, x % 3 === 2 ? G[2] : G[G.length - 2]);
  u = p.url(); cache.set(key, u);
  return u;
}
/** a compact plate (the item card, the coach): cream enamel in a steel bezel with a rivet in each corner */
export function cardURL(w: number, h: number, _seed = 1, _amber = false): string {
  const key = `card|${w}x${h}`; let u = cache.get(key); if (u) return u;
  const p = new Pen(w, h), P = RAMPS.paper;
  p.rect(0, 0, w, h, INK[0]); p.rect(1, 1, w - 2, h - 2, S[3]); p.bevel(1, 1, w - 2, h - 2, S[5], S[1]);
  p.rect(3, 3, w - 6, h - 6, P[5]); p.rect(3, 3, w - 6, Math.floor((h - 6) / 2), 0xfff6dc, 0.25);
  p.bevel(3, 3, w - 6, h - 6, S[1], P[3], true); p.hl(4, w - 5, h - 5, P[4]);
  if (h >= 20) for (const [x, y] of [[1, 1], [w - 4, 1], [1, h - 4], [w - 4, h - 4]]) p.rivet(x, y, S);
  u = p.url(); cache.set(key, u);
  return u;
}
/** a coach's pointer: a chunky enamel arrow with a dark rim, a lit top edge and a shaded underside; 'l' | 'r' | 'u' | 'd' */
export function arrowURL(dir: 'l' | 'r' | 'u' | 'd'): string {
  const key = 'arrow' + dir; let u = cache.get(key); if (u) return u;
  const W = 18, H = 15, R = RAMPS.stampRed, P = RAMPS.paper;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && ((x <= 9 && y >= 4 && y <= 10) || (x >= 9 && Math.abs(y - 7) <= 16 - x));
  const vert = dir === 'u' || dir === 'd', p = new Pen(vert ? H : W, vert ? W : H);
  const put = (x: number, y: number, c: number) => { const [a, b] = dir === 'r' ? [x, y] : dir === 'l' ? [W - 1 - x, y] : dir === 'd' ? [y, x] : [y, W - 1 - x]; p.px(a, b, c); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    put(x, y, edge ? INK[0] : !inside(x, y - 2) ? P[5] : !inside(x, y + 2) ? R[1] : R[3]);
  }
  u = p.url(); cache.set(key, u);
  return u;
}

// ------------------------------------------------------------------ glyphs (pixel bitmaps)
export const GLYPH: Record<string, string[]> = {
  type: ['##.##', '##.##', '.....', '#####', '#####'],
  name: ['.#..#', '#.#.#', '###.#', '#.#.#', '#.#..', '...#.', '..###', '...#.'],
  count: ['.#.#.', '#####', '.#.#.', '#####', '.#.#.'],
  value: ['.###.', '#.#.#', '##...', '.###.', '...##', '#.#.#', '.###.'],
  fresh: ['...##', '..###', '.###.', '###..', '#....'],
  gear: ['.#.#.', '#####', '##.##', '#####', '.#.#.'],
  close: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  search: ['.##..', '#..#.', '#..#.', '.##..', '...##'],
  left: ['..#', '.##', '###', '.##', '..#'],
  right: ['#..', '##.', '###', '##.', '#..'],
  size: ['##.##', '##.##', '.....', '##.##', '##.##'],
  stack: ['####', '....', '####', '....', '####'],
  clock: ['.###.', '#.#.#', '#.###', '#...#', '.###.'],
  mass: ['.###.', '..#..', '#####', '#####', '#####'],
  pin: ['.###.', '#####', '.###.', '..#..', '..#..'],
  drop: ['..#..', '.###.', '#####', '#####', '.###.'],
  worker: ['.##.', '.##.', '####', '.##.', '#..#'],
  plus: ['.#.', '###', '.#.'],
  funnel: ['#####', '.###.', '..#..', '..#..'],
};
