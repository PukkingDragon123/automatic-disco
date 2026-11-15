// The stores' materials. Every container window, control and HUD badge is cut from its container's own material:
// a field painted with the user's lowpix stroke brush (public/inv/ui/mat_*.png, src/inv/sprites/make_ui.py), with
// structure drawn on it here as crisp pixel art at art resolution (one art pixel = --ik screen pixels): planks with
// nails and rope handles, olive steel with rivets, an earthen rim with stones and roots, concrete with chips and rebar,
// frosted steel with rime, pipes with a sight glass, corrugated sheet, lacquered wood with brass and glass, brass with
// enamel. Cells are drawn INTO the material (compartments, slots, pockets, bays, racks, ports, hatches, drawers, trays).
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

// ------------------------------------------------------------------ the painted fields and kind icons
const imgs = new Map<string, HTMLImageElement>();
let ready: Promise<void> | null = null;
const listeners: (() => void)[] = [];
/** load every field and kind icon once; call `onMats` to repaint when they land */
export function loadMats(): Promise<void> {
  if (ready) return ready;
  const names = ['crate', 'lacquer', 'olive', 'hold', 'earth', 'concrete', 'frost', 'teal', 'corr', 'brass', 'paper', 'gun'].map((n) => 'mat_' + n)
    .concat(['crate', 'st_bin', 'st_pit', 'st_bunker', 'st_freezer', 'st_tank', 'silo', 'st_cabinet', 'st_vault', 'hold'].map((k) => 'kind_' + k));
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
  /** a field image cut at an offset (tiled if it is smaller than the area) */
  field(name: string, x: number, y: number, w: number, h: number, ox: number, oy: number, fallback: number) {
    const im = imgs.get('mat_' + name);
    if (!im) { this.rect(x, y, w, h, fallback); return; }
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
  /** a dome rivet / nail head: 3 x 3, lit top-left, with a 1 px cast shadow */
  rivet(x: number, y: number, R: Ramp) {
    this.px(x + 1, y + 3, 0x0a0b0d, 0.35); this.px(x + 3, y + 1, 0x0a0b0d, 0.35); this.px(x + 2, y + 3, 0x0a0b0d, 0.35); this.px(x + 3, y + 2, 0x0a0b0d, 0.35);
    this.rect(x, y, 3, 3, R[2]); this.px(x, y, R[R.length - 1]); this.px(x + 1, y, R[R.length - 2]); this.px(x, y + 1, R[R.length - 2]); this.px(x + 2, y + 2, R[1]);
  }
  /** draw a small bitmap (rows of '#') */
  glyph(g: string[], x: number, y: number, c: number, shadow = -1) {
    for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === '#') { if (shadow >= 0) this.px(x + i + 1, y + j + 1, shadow, 0.6); this.px(x + i, y + j, c); }
  }
  url() { return this.c.toDataURL(); }
}
const h1 = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const S = RAMPS.steel, OCH = RAMPS.ochre, FUR = RAMPS.fur, STR = RAMPS.straw, SN = RAMPS.snow, RU = RAMPS.rust, BR = RAMPS.brass, TE = RAMPS.teal, WA = RAMPS.water;

// ------------------------------------------------------------------ the window panel
export interface PanelLayout { w: number; h: number; head: number; gx: number; gy: number; cols: number; rows: number; cell: number; fill: number; frame: number; ctrlY: number }
/** the fill gauge's well in a panel's foot: x, y, w, h (art pixels) */
export const gaugeRect = (L: PanelLayout): [number, number, number, number] => [L.frame + 2, L.h - L.frame - 10, L.w - 2 * L.frame - 84, 7];
const cache = new Map<string, string>();
/** a container window's background, painted at art resolution and cached by kind, size and seed */
export function panelURL(kind: ContainerKind, L: PanelLayout, seed: number): string {
  const key = `${kind}|${L.w}x${L.h}|${L.cols}x${L.rows}|${Math.round(L.fill * 12)}|${seed}|${matsLoaded()}`;
  let u = cache.get(key); if (u) return u;
  const m = MAT[kind], p = new Pen(L.w, L.h), F = L.frame;
  // the body: the material field, a band a shade darker behind the header and the controls
  p.field(m.field, 0, 0, L.w, L.h, Math.floor(h1(seed) * 120), Math.floor(h1(seed, 2) * 90), m.R[3]);
  calm(p, kind, 0, 0, L.w, L.h);
  p.shade(F, F, L.w - 2 * F, L.head, -0.12);
  frame(p, kind, L, seed);
  cells(p, kind, L, seed);
  // the fill gauge's well in the foot (the numbers sit to its right)
  const [gx, gy, gw, gh] = gaugeRect(L);
  p.shade(gx, gy, gw, gh, -0.35); p.bevel(gx, gy, gw, gh, m.ink, m.light, true);
  u = p.url(); cache.set(key, u);
  return u;
}
/** busy grain is quietened under the things that sit on it: a wash of the material's mid tone */
function calm(p: Pen, kind: ContainerKind, x: number, y: number, w: number, h: number, k = 1) {
  const a = ({ plank: 0.3, lacquer: 0.22, steel: 0.18, corr: 0.2, earth: 0.12, concrete: 0.12, frost: 0.1, pipe: 0.18, brass: 0.2 } as Record<Style, number>)[MAT[kind].style] * k;
  if (a > 0) p.rect(x, y, w, h, MAT[kind].R[3], a);
}
function frame(p: Pen, kind: ContainerKind, L: PanelLayout, seed: number) {
  const m = MAT[kind], F = L.frame, W = L.w, H = L.h;
  const outline = () => { p.hl(0, W - 1, 0, m.ink); p.hl(0, W - 1, H - 1, m.ink); p.vl(0, 0, H - 1, m.ink); p.vl(W - 1, 0, H - 1, m.ink); };
  switch (m.style) {
    case 'plank': {
      // four boards round the edge, darker posts at the corners, nails, a rope handle each side
      for (const [x, y, w, h] of [[0, 0, W, F], [0, H - F, W, F], [0, 0, F, H], [W - F, 0, F, H]]) { p.shade(x, y, w, h, -0.12); p.bevel(x, y, w, h, OCH[6], FUR[1]); }
      for (const [x, y] of [[0, 0], [W - F, 0], [0, H - F], [W - F, H - F]]) { p.shade(x, y, F, F, -0.22); p.bevel(x, y, F, F, OCH[5], FUR[0]); p.rivet(x + 2, y + 2, S); }
      for (let x = F + 14; x < W - F - 8; x += 38) { p.rivet(x, 2, S); if (x < W - 52) p.rivet(x, H - F + 2, S); }
      stencil(p, seed, W - 12, H - 7, FUR[0], 0.75, false);
      for (const side of [0, 1]) { // rope handles: a twisted loop off the side boards
        const x0 = side ? W - 3 : 2, cy = Math.floor(H / 2);
        for (let t = 0; t <= 16; t++) { const a = (t / 16) * Math.PI, y = Math.round(cy - 10 + (t / 16) * 20), dx = Math.round(Math.sin(a) * 4) * (side ? 1 : -1); p.px(x0 + dx, y, t % 2 ? STR[2] : STR[4]); p.px(x0 + dx + (side ? -1 : 1), y, STR[3]); }
      }
      outline(); break;
    }
    case 'steel': case 'corr': {
      p.bevel(0, 0, W, H, m.light, m.ink); p.bevel(1, 1, W - 2, H - 2, m.R[4], m.R[1]);
      p.bevel(F - 1, F - 1, W - 2 * F + 2, H - 2 * F + 2, m.ink, m.light, true);
      for (let x = 10; x < W - 10; x += 18) { p.rivet(x, 3, m.R); if (x < W - 52) p.rivet(x, H - 6, m.R); }
      stencil(p, seed, W - 12, H - 7, m.style === 'corr' ? RAMPS.stampRed[2] : m.light, 0.8, m.style === 'steel');
      for (let y = 21; y < H - 12; y += 18) { p.rivet(3, y, m.R); p.rivet(W - 6, y, m.R); }
      // corner gussets
      for (const [x, y, dx, dy] of [[1, 1, 1, 1], [W - 2, 1, -1, 1], [1, H - 2, 1, -1], [W - 2, H - 2, -1, -1]]) for (let k = 0; k < 6; k++) p.hl(x, x + dx * (5 - k), y + dy * k, m.R[2]);
      break;
    }
    case 'earth': {
      // a rough earthen rim: ragged outer edge, stones bedded in it, roots crossing, grass along the top
      p.shade(0, 0, W, F, -0.2); p.shade(0, H - F, W, F, -0.25); p.shade(0, 0, F, H, -0.2); p.shade(W - F, 0, F, H, -0.2);
      for (let x = 0; x < W; x++) { if (h1(x, seed) < 0.35) p.px(x, 0, 0x000000, 0) ; }
      for (let k = 0; k < (W + H) / 9; k++) {
        const e = Math.floor(h1(k, seed + 3) * 4), t = h1(k, seed + 4);
        const [x, y] = e === 0 ? [Math.floor(t * W), 1 + Math.floor(h1(k, 9) * (F - 4))] : e === 1 ? [Math.floor(t * W), H - F + 1 + Math.floor(h1(k, 9) * (F - 4))] : e === 2 ? [1 + Math.floor(h1(k, 9) * (F - 4)), Math.floor(t * H)] : [W - F + 1 + Math.floor(h1(k, 9) * (F - 4)), Math.floor(t * H)];
        const st = RAMPS.stone; p.rect(x, y, 3, 2, st[3]); p.hl(x, x + 2, y, st[5]); p.px(x + 2, y + 1, st[1]);
      }
      for (let k = 0; k < 7; k++) { let x = Math.floor(h1(k, seed + 7) * W), y = Math.floor(h1(k, seed + 8) * F); for (let i = 0; i < 18; i++) { p.px(x, y, FUR[2]); x += 1; y += h1(i + k * 20, 5) < 0.4 ? 1 : 0; if (y > H) break; } }
      for (let x = 2; x < W - 2; x += 2 + Math.floor(h1(x, seed) * 4)) { const hgt = 1 + Math.floor(h1(x, seed + 1) * 4); for (let j = 0; j < hgt; j++) p.px(x + (j > 1 ? 1 : 0), F - 1 - j - 3, j > 1 ? RAMPS.moss[5] : RAMPS.moss[3]); }
      p.bevel(F - 1, F - 1, W - 2 * F + 2, H - 2 * F + 2, m.ink, m.R[5], true);
      break;
    }
    case 'concrete': {
      p.bevel(0, 0, W, H, m.R[6], m.ink); p.bevel(F - 1, F - 1, W - 2 * F + 2, H - 2 * F + 2, m.ink, m.R[6], true);
      // chamfered corners, chips knocked out of the edge, rebar stubs at the corners
      for (const [x, y, dx, dy] of [[0, 0, 1, 1], [W - 1, 0, -1, 1], [0, H - 1, 1, -1], [W - 1, H - 1, -1, -1]]) for (let k = 0; k < 4; k++) { p.hl(x, x + dx * (3 - k), y + dy * k, 0x000000, 0); p.x.clearRect(Math.min(x, x + dx * (3 - k)), y + dy * k, 4 - k, 1); }
      for (let k = 0; k < (W + H) / 14; k++) { const x = Math.floor(h1(k, seed) * W), top = h1(k, seed + 1) < 0.5; p.x.clearRect(x, top ? 0 : H - 1, 2 + (k % 2), 1); p.px(x, top ? 1 : H - 2, m.R[1]); }
      for (const [x, y, dx, dy] of [[3, 3, 1, 0], [W - 4, 3, 0, 1], [3, H - 4, 0, -1], [W - 4, H - 4, -1, 0]]) for (let k = 0; k < 6; k++) p.px(x + dx * k, y + dy * k, k % 2 ? RU[2] : RU[4]);
      stencil(p, seed, W - 12, H - 7, m.R[1], 0.8, true);
      break;
    }
    case 'frost': {
      p.bevel(0, 0, W, H, SN[5], S[1]); p.bevel(1, 1, W - 2, H - 2, S[5], S[2]);
      p.bevel(F - 1, F - 1, W - 2 * F + 2, H - 2 * F + 2, S[1], SN[4], true);
      // rime along the top edge, icicles hanging off it, frost creeping in at the corners
      for (let x = 1; x < W - 1; x++) { p.px(x, 1, SN[5]); if (h1(x, seed) < 0.6) p.px(x, 2, SN[4]); const len = h1(x, seed + 2) < 0.18 ? 2 + Math.floor(h1(x, seed + 3) * 4) : 0; for (let j = 0; j < len; j++) p.px(x, 3 + j, j === len - 1 ? SN[3] : SN[5]); }
      for (const [cx, cy] of [[F, F], [W - F, F], [F, H - F], [W - F, H - F]]) for (let k = 0; k < 26; k++) { const a = h1(k, cx + cy) * 6.28, r = h1(k, cy) * 7; p.px(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), SN[h1(k, 3) < 0.5 ? 5 : 3], 0.85); }
      for (let x = 12; x < W - 12; x += 26) { p.rivet(x, H - 6, S); }
      break;
    }
    case 'pipe': {
      // the frame is pipework: a pipe along each edge, elbows at the corners, flanges with bolts, a sight glass on the
      // right that shows how full the tank is
      const pipe = (x: number, y: number, len: number, vert: boolean) => {
        const bands = [S[1], S[4], S[6], S[5], S[3], S[2], S[1]];
        for (let k = 0; k < 7; k++) vert ? p.rect(x + k, y, 1, len, bands[k]) : p.rect(x, y + k, len, 1, bands[k]);
      };
      pipe(0, 0, W, false); pipe(0, H - 7, W, false); pipe(0, 0, H, true); pipe(W - 7, 0, H, true);
      for (const [x, y] of [[0, 0], [W - 7, 0], [0, H - 7], [W - 7, H - 7]]) { p.rect(x, y, 7, 7, S[3]); p.bevel(x, y, 7, 7, S[6], S[1]); p.rivet(x + 2, y + 2, BR); }
      for (const x of [Math.floor(W * 0.33), Math.floor(W * 0.66)]) for (const y of [0, H - 7]) { p.rect(x, y - 1 + (y ? 0 : 1), 4, 9 - (y ? 0 : 1), S[2]); p.bevel(x, y, 4, 7, S[5], S[0]); p.px(x + 1, y + 1, BR[5]); p.px(x + 1, y + 5, BR[5]); }
      // sight glass on the right pipe: a slot of glass with the water level
      const gx = W - 6, gy0 = 14, gy1 = H - 14, lvl = Math.round(gy1 - (gy1 - gy0) * L.fill);
      p.rect(gx, gy0, 5, gy1 - gy0, S[0]); p.rect(gx + 1, gy0 + 1, 3, gy1 - gy0 - 2, TE[1]);
      p.rect(gx + 1, lvl, 3, gy1 - lvl - 1, WA[4]); p.hl(gx + 1, gx + 3, lvl, WA[6]); p.vl(gx + 1, gy0 + 2, gy1 - 3, SN[4], 0.5);
      for (let y = gy0 + 6; y < gy1; y += 10) p.px(gx + 4, y, S[6]);
      p.bevel(F - 1, F - 1, W - 2 * F + 2, H - 2 * F + 2, TE[0], TE[4], true);
      break;
    }
    case 'lacquer': {
      p.shade(0, 0, W, F, -0.1); p.shade(0, H - F, W, F, -0.1);
      p.bevel(0, 0, W, H, m.R[5], m.ink); p.hl(2, W - 3, 2, 0xfff6dc, 0.35);
      p.bevel(F - 1, F - 1, W - 2 * F + 2, H - 2 * F + 2, m.ink, m.R[4], true);
      // brass corner brackets with a rivet each
      for (const [x, y, dx, dy] of [[1, 1, 1, 1], [W - 2, 1, -1, 1], [1, H - 2, 1, -1], [W - 2, H - 2, -1, -1]]) { for (let k = 0; k < 9; k++) { p.px(x + dx * k, y, BR[4]); p.px(x, y + dy * k, BR[4]); p.px(x + dx * k, y + dy, BR[2]); p.px(x + dx, y + dy * k, BR[2]); } p.rivet(x + (dx > 0 ? 2 : -4), y + (dy > 0 ? 2 : -4), BR); }
      break;
    }
    case 'brass': {
      p.bevel(0, 0, W, H, BR[5], BR[0]); p.bevel(1, 1, W - 2, H - 2, BR[4], BR[1]);
      // an enamel band inside the brass, chipped
      p.rect(F - 3, F - 3, W - 2 * F + 6, 2, TE[2]); p.rect(F - 3, H - F + 1, W - 2 * F + 6, 2, TE[2]); p.rect(F - 3, F - 3, 2, H - 2 * F + 6, TE[2]); p.rect(W - F + 1, F - 3, 2, H - 2 * F + 6, TE[2]);
      for (let k = 0; k < 12; k++) { const x = F - 3 + Math.floor(h1(k, seed) * (W - 2 * F + 6)); p.px(x, F - 3, BR[1]); }
      for (let x = 10; x < W - 10; x += 20) { p.rivet(x, 1, BR); p.rivet(x, H - 4, BR); }
      p.bevel(F - 1, F - 1, W - 2 * F + 2, H - 2 * F + 2, BR[0], BR[5], true);
      break;
    }
  }
}
/** a stencilled serial on the bottom frame, right-aligned at x: two digits sprayed through a 3 x 5 stencil (the
 *  bridges left open), and, on steel and concrete, a block of hazard chevrons before it */
const DIG = ['###|#.#|#.#|#.#|###', '.#.|##.|.#.|.#.|###', '##.|..#|.#.|#..|###', '##.|..#|.#.|..#|##.', '#.#|#.#|###|..#|..#', '###|#..|##.|..#|##.', '.##|#..|###|#.#|###', '###|..#|.#.|.#.|.#.', '###|#.#|.#.|#.#|###', '###|#.#|###|..#|##.'].map((d) => d.split('|'));
function stencil(p: Pen, n: number, x: number, y: number, c: number, a: number, hazard: boolean) {
  const t = String(n % 100).padStart(2, '0');
  let cx = x - t.length * 4 + 1;
  for (const ch of t) { const g = DIG[Number(ch)]; for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '#' && !(j === 2 && i === 1 && ch === '0')) p.px(cx + i, y + j, c, a); cx += 4; }
  if (hazard) { const hx = x - t.length * 4 - 16; for (let j = 0; j < 5; j++) for (let i = 0; i < 13; i++) p.px(hx + i, y + j, (i + j) % 6 < 3 ? RAMPS.glowAmber[3] : RAMPS.ink[0], 0.85); }
}
/** the cells, drawn into the material: one per grid position */
function cells(p: Pen, kind: ContainerKind, L: PanelLayout, seed: number) {
  const m = MAT[kind], C = L.cell;
  // the whole grid well first, then each cell
  p.shade(L.gx - 2, L.gy - 2, L.cols * C + 4, L.rows * C + 4, -0.3);
  p.bevel(L.gx - 2, L.gy - 2, L.cols * C + 4, L.rows * C + 4, m.ink, m.light, true);
  for (let j = 0; j < L.rows; j++) for (let i = 0; i < L.cols; i++) {
    const x = L.gx + i * C, y = L.gy + j * C, s = C;
    switch (m.style) {
      case 'plank': { // cubbies sunk between battens: a dark warm hollow, shadow under the top batten, a lit floor lip
        const ix = x + 2, iy = y + 2, n = s - 3;
        p.rect(ix, iy, n, n, FUR[1], 0.62);
        p.hl(ix, ix + n - 1, iy, FUR[0]); p.hl(ix, ix + n - 1, iy + 1, FUR[0], 0.55); p.hl(ix, ix + n - 1, iy + 2, FUR[0], 0.25); p.vl(ix, iy, iy + n - 1, FUR[0], 0.7);
        p.hl(ix + 1, ix + n - 1, iy + n - 1, OCH[3], 0.7); p.vl(ix + n - 1, iy + 2, iy + n - 1, OCH[2], 0.6);
        p.rect(x, y, s, 2, OCH[3]); p.hl(x, x + s - 1, y, OCH[5]); p.rect(x, y, 2, s, OCH[3]); p.vl(x, y, y + s - 1, OCH[4]);
        if ((i + j) % 2 === 0) { p.px(x, y, S[5]); p.px(x + 1, y + 1, S[1]); }
        break;
      }
      case 'steel': case 'corr': // pressed slots with a rivet in each corner
        p.rect(x + 1, y + 1, s - 2, s - 2, m.ink, 0.5); p.bevel(x + 1, y + 1, s - 2, s - 2, m.ink, m.light, true); p.hl(x + 2, x + s - 3, y + 2, m.ink, 0.5);
        for (const [dx, dy] of [[3, 3], [s - 5, 3], [3, s - 5], [s - 5, s - 5]]) p.px(x + dx, y + dy, m.R[5]);
        break;
      case 'earth': { // pockets dug in the earth, ragged rims with pebbles
        p.shade(x + 2, y + 2, s - 4, s - 4, -0.5);
        for (const [cx, cy] of [[x + 2, y + 2], [x + s - 3, y + 2], [x + 2, y + s - 3], [x + s - 3, y + s - 3]]) p.shade(cx, cy, 1, 1, 0.25);
        p.hl(x + 3, x + s - 4, y + 2, RAMPS.soil[1]); p.hl(x + 3, x + s - 4, y + s - 3, RAMPS.soil[5]);
        if (h1(i + j * 13, seed) < 0.5) { const sx = x + 4 + Math.floor(h1(i, j) * (s - 10)); p.rect(sx, y + s - 3, 2, 1, RAMPS.stone[5]); }
        break;
      }
      case 'concrete': // bays with rebar along the joints
        p.shade(x + 2, y + 2, s - 4, s - 4, -0.4); p.bevel(x + 2, y + 2, s - 4, s - 4, m.ink, m.R[5], true);
        for (let k = 0; k < s; k += 2) { p.px(x + k, y, k % 4 ? RU[3] : RU[2]); p.px(x, y + k, k % 4 ? RU[3] : RU[2]); }
        break;
      case 'frost': // wire racks over a cold dark well, frost on the wires
        p.rect(x + 1, y + 1, s - 2, s - 2, RAMPS.slate[1]); p.shade(x + 1, y + 1, s - 2, 3, -0.3);
        p.hl(x, x + s - 1, y, S[5]); p.vl(x, y, y + s - 1, S[5]); p.hl(x, x + s - 1, y + s - 1, S[3]);
        for (let k = 0; k < s; k += 3) if (h1(k + i * 7 + j * 3, seed) < 0.5) p.px(x + k, y - 1 + (k % 2), SN[5]);
        if (h1(i * 3 + j, seed + 5) < 0.35) p.vl(x + 4 + Math.floor(h1(i, seed) * (s - 8)), y + 1, y + 2 + Math.floor(h1(j, seed) * 3), SN[4]);
        break;
      case 'pipe': // round-cornered glass ports
        p.rect(x + 2, y + 2, s - 4, s - 4, TE[1]); p.shade(x + 2, y + 2, s - 4, s - 4, -0.25);
        p.bevel(x + 1, y + 1, s - 2, s - 2, S[1], S[5], true);
        for (const [cx, cy] of [[x + 1, y + 1], [x + s - 2, y + 1], [x + 1, y + s - 2], [x + s - 2, y + s - 2]]) p.px(cx, cy, S[3]);
        for (let k = 0; k < 6; k++) p.px(x + 4 + k, y + 8 - k, SN[5], 0.4);
        break;
      case 'lacquer': // glass-fronted drawers with a brass pull
        p.shade(x + 1, y + 1, s - 2, s - 2, -0.35); p.bevel(x + 1, y + 1, s - 2, s - 2, m.ink, m.R[4], true);
        p.rect(x + 3, y + 3, s - 6, s - 9, TE[4], 0.18);
        for (let k = 0; k < 7; k++) p.px(x + 5 + k, y + 12 - k, SN[5], 0.35);
        p.rect(x + Math.floor(s / 2) - 3, y + s - 5, 6, 2, BR[4]); p.hl(x + Math.floor(s / 2) - 3, x + Math.floor(s / 2) + 2, y + s - 5, BR[5]);
        break;
      case 'brass': // enamel trays in brass rims, a chip or two
        p.rect(x + 2, y + 2, s - 4, s - 4, TE[1]); p.bevel(x + 1, y + 1, s - 2, s - 2, BR[1], BR[5], true);
        p.bevel(x + 2, y + 2, s - 4, s - 4, TE[0], TE[3], true);
        if (h1(i + j * 5, seed) < 0.3) { const cx = x + 4 + Math.floor(h1(i, seed + 1) * (s - 8)); p.rect(cx, y + 3, 2, 1, RAMPS.ink[1]); }
        break;
    }
  }
}

// ------------------------------------------------------------------ small controls in the same material
/** a tab, tag or label in the container's material: w x h art pixels; state 0 idle, 1 hover, 2 active */
export function ctlURL(kind: ContainerKind, w: number, h: number, state: 0 | 1 | 2, glyph?: string[], seed = 1): string {
  const key = `ctl|${kind}|${w}x${h}|${state}|${glyph?.join('') ?? ''}|${seed}|${matsLoaded()}`;
  let u = cache.get(key); if (u) return u;
  const m = MAT[kind], p = new Pen(w, h);
  if (m.ctl === 'wood') {
    // a burned wood tag: a board offcut with scorched edges and a nail
    // a pale offcut (the grain quietened so the burned mark reads), scorched round the edge, the mark burned in
    const R = kind === 'st_cabinet' ? RAMPS.clay : OCH;
    p.field(kind === 'st_cabinet' ? 'lacquer' : 'crate', 0, 0, w, h, seed * 17, seed * 9, R[4]);
    p.rect(0, 0, w, h, state === 2 ? OCH[6] : R[Math.min(R.length - 1, 5)], state === 2 ? 0.72 : state === 1 ? 0.62 : 0.5);
    for (let x = 0; x < w; x++) { p.px(x, 0, FUR[h1(x, seed) < 0.5 ? 1 : 0], 0.85); p.px(x, 1, FUR[2], 0.35); p.px(x, h - 1, FUR[0]); if (h1(x, seed + 1) < 0.45) p.px(x, h - 2, FUR[1], 0.6); }
    for (let y = 0; y < h; y++) { p.px(0, y, FUR[0]); p.px(w - 1, y, FUR[0]); p.px(1, y, FUR[2], 0.35); }
    if (w > 20) { p.px(2, Math.floor(h / 2) - 1, S[5]); p.px(2, Math.floor(h / 2), S[2]); }
    if (glyph) p.glyph(glyph, Math.floor((w - glyph[0].length) / 2), Math.floor((h - glyph.length) / 2), state === 2 ? RAMPS.stampRed[2] : FUR[0], state === 2 ? OCH[3] : FUR[2]);
  } else if (m.ctl === 'frost') {
    // a frost-etched label: frosted glass in a steel bezel, the mark etched clear
    p.rect(0, 0, w, h, S[1]); p.rect(1, 1, w - 2, h - 2, state === 2 ? SN[5] : SN[3]); p.shade(1, 1, w - 2, h - 2, state === 1 ? 0.12 : 0);
    for (let k = 0; k < (w * h) / 6; k++) p.px(1 + Math.floor(h1(k, seed) * (w - 2)), 1 + Math.floor(h1(k, seed + 1) * (h - 2)), SN[h1(k, 3) < 0.5 ? 5 : 2], 0.7);
    p.bevel(0, 0, w, h, S[5], S[0]);
    if (glyph) p.glyph(glyph, Math.floor((w - glyph[0].length) / 2), Math.floor((h - glyph.length) / 2), state === 2 ? RAMPS.slate[1] : RAMPS.slate[2], SN[5]);
  } else {
    // a stamped metal tab: a plate pressed with the mark, two rivets, enamel when active
    const R = state === 2 ? RAMPS.glowAmber : m.R;
    p.field(state === 2 ? 'brass' : MAT[kind].field, 0, 0, w, h, seed * 13, seed * 7, R[3]);
    p.rect(0, 0, w, h, state === 2 ? RAMPS.glowAmber[2] : R[2], state === 2 ? 0.55 : 0.35);
    p.shade(0, 0, w, h, state === 1 ? 0.1 : 0);
    p.bevel(0, 0, w, h, R[R.length - 1], RAMPS.ink[0]); p.bevel(1, 1, w - 2, h - 2, R[Math.min(R.length - 1, 4)], R[1]);
    if (w > 12) { p.px(2, 2, R[1]); p.px(w - 3, 2, R[1]); }
    if (glyph) p.glyph(glyph, Math.floor((w - glyph[0].length) / 2), Math.floor((h - glyph.length) / 2), state === 2 ? RAMPS.ink[1] : R[R.length - 1], RAMPS.ink[0]);
  }
  u = p.url(); cache.set(key, u);
  return u;
}

// ------------------------------------------------------------------ the HUD plate and badges
/** the crate HUD's own plate: riveted gunmetal */
export function hudPlateURL(w: number, h: number): string {
  const key = `hud|${w}x${h}|${matsLoaded()}`; let u = cache.get(key); if (u) return u;
  const p = new Pen(w, h);
  p.field('gun', 0, 0, w, h, 30, 20, S[2]);
  p.bevel(0, 0, w, h, S[6], S[0]); p.bevel(1, 1, w - 2, h - 2, S[4], S[1]);
  for (let x = 8; x < w - 6; x += 20) { p.rivet(x, 2, S); p.rivet(x, h - 5, S); }
  for (let y = 22; y < h - 10; y += 20) { p.rivet(2, y, S); p.rivet(w - 5, y, S); }
  u = p.url(); cache.set(key, u);
  return u;
}
/** a plain plate of a container's material (the settings plate): field and frame, no cells */
export function plainURL(kind: ContainerKind, w: number, h: number, seed: number): string {
  const key = `plain|${kind}|${w}x${h}|${seed}|${matsLoaded()}`; let u = cache.get(key); if (u) return u;
  const m = MAT[kind], p = new Pen(w, h);
  p.field(m.field, 0, 0, w, h, seed * 19, seed * 5, m.R[3]);
  frame(p, kind, { w, h, head: 0, gx: 0, gy: 0, cols: 0, rows: 0, cell: 1, fill: 0, frame: 6, ctrlY: 0 }, seed);
  u = p.url(); cache.set(key, u);
  return u;
}
/** a container's badge: a plate of its own material, its painted icon, its logo stamped in its paint, the gauge */
export function badgeURL(kind: ContainerKind, w: number, h: number, logo: string[], paint: Ramp, fill: number, seed: number): string {
  const key = `badge|${kind}|${w}x${h}|${logo.join('')}|${paint[3]}|${Math.round(fill * 20)}|${seed}|${matsLoaded()}`;
  let u = cache.get(key); if (u) return u;
  const m = MAT[kind], p = new Pen(w, h);
  p.field(m.field, 0, 0, w, h, seed * 21, seed * 11, m.R[3]);
  p.bevel(0, 0, w, h, m.light, m.ink); p.bevel(1, 1, w - 2, h - 2, m.R[Math.min(m.R.length - 1, 5)], m.R[1]);
  // the icon on a darker ground
  p.shade(3, 3, w - 6, 38, -0.3); p.bevel(3, 3, w - 6, 38, m.ink, m.light, true);
  const ic = kindIcon(kind); if (ic) p.x.drawImage(ic, Math.floor((w - 32) / 2), 6);
  // the logo, sprayed in the container's paint on a little plate
  p.rect(w - 17, 26, 14, 14, paint[1]); p.rect(w - 16, 27, 12, 12, paint[3]);
  p.glyph(logo, w - 16, 27, paint.length > 5 ? paint[5] : paint[paint.length - 1]);
  // the item rows' tray, then the gauge
  p.shade(3, 56, w - 6, h - 66, -0.22); p.bevel(3, 56, w - 6, h - 66, m.ink, m.light, true);
  const gy = h - 7; p.rect(3, gy, w - 6, 4, RAMPS.ink[0]);
  const gw = Math.round((w - 8) * Math.min(1, fill)); const G = fill > 0.9 ? RAMPS.stampRed : RAMPS.moss;
  for (let x = 0; x < gw; x++) p.vl(4 + x, gy + 1, gy + 2, x % 3 === 2 ? G[2] : G[G.length - 2]);
  u = p.url(); cache.set(key, u);
  return u;
}
/** a compact card (tooltips, the tutorial): textured paper, an inked edge, a lit lip */
export function cardURL(w: number, h: number, seed = 1, enamel = false): string {
  const key = `card|${w}x${h}|${seed}|${enamel}|${matsLoaded()}`; let u = cache.get(key); if (u) return u;
  const p = new Pen(w, h), P = RAMPS.paper;
  if (enamel) { p.rect(0, 0, w, h, P[5]); p.field('paper', 1, 1, w - 2, h - 2, 40, 10, P[4]); p.rect(1, 1, w - 2, h - 2, P[5], 0.45); }
  else p.field('paper', 0, 0, w, h, seed * 23, seed * 7, P[4]);
  p.hl(1, w - 2, 1, P[5]); p.vl(1, 1, h - 2, P[5]);
  p.hl(0, w - 1, 0, RAMPS.ink[1]); p.hl(0, w - 1, h - 1, RAMPS.ink[1]); p.vl(0, 0, h - 1, RAMPS.ink[1]); p.vl(w - 1, 0, h - 1, RAMPS.ink[1]);
  if (enamel) { // chipped enamel: dark chips at the edge, a hanging hole
    for (let k = 0; k < 7; k++) { const x = Math.floor(h1(k, seed) * (w - 4)) + 2; p.rect(x, k % 2 ? h - 3 : 1, 2, 2, RAMPS.ink[2]); }
  }
  // a coffee ring on one card in four
  if (!enamel && seed % 4 === 1) for (let a = 0; a < 40; a++) { const t = (a / 40) * 6.28; if (a % 7 === 3) continue; p.px(Math.round(w - 18 + Math.cos(t) * 9), Math.round(h - 14 + Math.sin(t) * 7), RAMPS.ochre[2], 0.35); }
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
    put(x, y, edge ? RAMPS.ink[0] : !inside(x, y - 2) ? P[5] : !inside(x, y + 2) ? R[1] : R[3]);
  }
  u = p.url(); cache.set(key, u);
  return u;
}

// ------------------------------------------------------------------ glyphs (hand-placed pixels)
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
