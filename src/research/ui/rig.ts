// The research rig's machined parts, painted as clean pixel art at half resolution and shown 2x (never hand-drawn):
//   Cradle   the scanner housing: a bevelled gunmetal body, a bolted steel bezel round a glass window, the specimen
//            (a real render of it, brought down to a short ramp) held in two clamp jaws, a scan beam sweeping, lamps
//   Vials    the data reserves as four glass vials in a steel rack, filling and bubbling, a brass mark at the level the
//            selected tech needs, and the stations dial with its needle
//   Drum     the research queue as a rotary card drum (a reel of enamel cards on an axle, a geared wheel on its side):
//            the head card faces you and the drum turns when the queue moves on
import { iconCanvas } from './icons';

const INK = '#15171b';
const GUN = ['#1d2025', '#282d33', '#343a41', '#424a52', '#58616a'];
const STEEL = ['#3a3f44', '#5c636a', '#858d93', '#aab1b4', '#d2d7d6'];
const BRASS = ['#5a4318', '#8a6a2a', '#b8913e', '#d8b562', '#efd690'];
const CREAM = ['#a9a28e', '#d9d1bb', '#e8e1cd', '#f3eedf'];
const AMBER = ['#7a4a12', '#b8761e', '#e0a33a', '#f2c86a'];
export const LIQUID: Record<string, [string, string, string]> = {
  bio: ['#2f6a22', '#5fae3c', '#9ad86a'], geo: ['#7a4416', '#c07a2c', '#eab060'],
  energy: ['#1f6a8a', '#3ab4d8', '#8ae6f8'], xeno: ['#4f3290', '#9a6ad8', '#cfa8f8'],
};

type G = CanvasRenderingContext2D;
const R = (g: G, x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
/** an inked, bevelled block: lit top and left, shaded bottom and right, chamfered corners */
function block(g: G, x: number, y: number, w: number, h: number, ramp: string[], ch = 2) {
  R(g, x, y, w, h, INK); R(g, x + 1, y + 1, w - 2, h - 2, ramp[2]);
  R(g, x + 1, y + 1, w - 2, 1, ramp[4] ?? ramp[3]); R(g, x + 1, y + 1, 1, h - 2, ramp[3]);
  R(g, x + 1, y + h - 2, w - 2, 1, ramp[1]); R(g, x + w - 2, y + 1, 1, h - 2, ramp[1]);
  for (let i = 0; i < ch; i++) for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w - 1, y, -1, 1], [x, y + h - 1, 1, -1], [x + w - 1, y + h - 1, -1, -1]]) {
    for (let j = 0; j < ch - i; j++) g.clearRect(cx + sx * j, cy + sy * i, 1, 1);
    R(g, cx + sx * (ch - i), cy + sy * i, 1, 1, INK);
  }
}
/** a hex bolt, 5x5 */
function bolt(g: G, x: number, y: number) {
  R(g, x - 2, y - 1, 5, 3, INK); R(g, x - 1, y - 2, 3, 5, INK);
  R(g, x - 1, y - 1, 3, 3, STEEL[2]); R(g, x - 1, y - 1, 2, 1, STEEL[4]); R(g, x - 1, y - 1, 1, 2, STEEL[3]); R(g, x + 1, y + 1, 1, 1, STEEL[0]);
}
function lamp(g: G, x: number, y: number, on: boolean, c: [string, string]) {
  R(g, x - 1, y - 1, 7, 7, INK); R(g, x, y, 5, 5, on ? c[0] : '#2a2e33'); if (on) { R(g, x + 1, y + 1, 2, 2, c[1]); } else R(g, x + 1, y + 1, 1, 1, '#4a5058');
}
const low = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; return { c, g }; };
/** a low-resolution, short-ramp copy of a render (the specimen) fitted over w x h (cover) */
export function stylisePhoto(img: HTMLImageElement | HTMLCanvasElement, w: number, h: number) {
  const { c, g } = low(w, h); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  const iw = img.width, ih = img.height, k = Math.max(w / iw, h / ih), sw = w / k, sh = h / k;
  g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) for (let ch = 0; ch < 3; ch++) d.data[i + ch] = Math.min(255, Math.round(((d.data[i + ch] - 128) * 1.12 + 128) / 24) * 24);
  g.putImageData(d, 0, 0); return c;
}

/** the scanner cradle (310 x 220 low-res, shown at 620 x 440) */
export class Cradle {
  readonly cv: HTMLCanvasElement; private g: G; private base: HTMLCanvasElement; private photo: HTMLCanvasElement | null = null;
  static W = 310; static H = 220;
  private win = { x: 22, y: 18, w: 266, h: 156 };
  constructor() {
    this.cv = document.createElement('canvas'); this.cv.width = Cradle.W; this.cv.height = Cradle.H;
    this.g = this.cv.getContext('2d')!; this.g.imageSmoothingEnabled = false;
    this.base = this.paintBase();
  }
  setPhoto(url: string | null) {
    if (!url) { this.photo = null; return; }
    const im = new Image(); im.onload = () => { this.photo = stylisePhoto(im, this.win.w, this.win.h); }; im.src = url;
  }
  private paintBase() {
    const { c, g } = low(Cradle.W, Cradle.H), W = this.win;
    block(g, 0, 0, Cradle.W, Cradle.H, GUN, 4);
    // brushed runs on the housing
    for (let y = 4; y < Cradle.H - 4; y += 3) R(g, 6 + ((y * 37) % 50), y, 30 + ((y * 13) % 60), 1, GUN[3]);
    // the steel bezel round the window, its bolts
    block(g, W.x - 8, W.y - 8, W.w + 16, W.h + 16, STEEL, 3);
    R(g, W.x - 1, W.y - 1, W.w + 2, W.h + 2, INK);
    for (const [x, y] of [[W.x - 4, W.y - 4], [W.x + W.w + 3, W.y - 4], [W.x - 4, W.y + W.h + 3], [W.x + W.w + 3, W.y + W.h + 3], [W.x + W.w / 2, W.y - 4], [W.x + W.w / 2, W.y + W.h + 3]]) bolt(g, x, y);
    // the lamp and vent strip under the window
    const y0 = W.y + W.h + 14;
    block(g, 12, y0 - 4, Cradle.W - 24, 26, GUN, 2);
    for (let k = 0; k < 7; k++) R(g, 150 + k * 8, y0 + 2, 5, 14, GUN[0]);
    // a knurled knob
    block(g, Cradle.W - 52, y0, 30, 14, STEEL, 2); for (let k = 0; k < 6; k++) R(g, Cradle.W - 48 + k * 4, y0 + 2, 2, 10, STEEL[1]);
    return c;
  }
  draw(t: number, scanning: boolean) {
    const g = this.g, W = this.win;
    g.clearRect(0, 0, Cradle.W, Cradle.H); g.drawImage(this.base, 0, 0);
    // the chamber
    R(g, W.x, W.y, W.w, W.h, '#161a1e');
    for (let x = W.x + 8; x < W.x + W.w; x += 18) R(g, x, W.y, 2, W.h, '#1d2226');
    if (this.photo) g.drawImage(this.photo, W.x, W.y);
    // the cradle: a base bar and two clamp jaws
    const by = W.y + W.h - 12;
    block(g, W.x + 10, by, W.w - 20, 10, STEEL, 1);
    for (const fx of [0.3, 0.7]) {
      const x = Math.round(W.x + W.w * fx);
      block(g, x - 4, by - 26, 8, 28, STEEL, 1);
      block(g, x - (fx < 0.5 ? -2 : 12), by - 30, 14, 6, BRASS, 1);
    }
    // the scan beam
    if (scanning) {
      const y = Math.round(W.y + 6 + (Math.sin(t * 1.4) * 0.5 + 0.5) * (W.h - 26));
      g.fillStyle = 'rgba(120, 230, 255, 0.16)'; g.fillRect(W.x, y - 4, W.w, 9);
      R(g, W.x, y, W.w, 1, '#9af0ff');
    }
    // the glass: a faint tint and two clean diagonal glints
    g.fillStyle = 'rgba(140, 190, 210, 0.06)'; g.fillRect(W.x, W.y, W.w, W.h);
    g.fillStyle = 'rgba(255, 255, 255, 0.11)';
    for (let y = 0; y < W.h; y++) { const x = W.x + 28 + Math.round(y * 0.55); g.fillRect(x, W.y + y, 14, 1); g.fillRect(x + 22, W.y + y, 4, 1); }
    // lamps: power, scanning, fault
    const ly = W.y + W.h + 18;
    lamp(g, 24, ly, true, ['#3f8a2a', '#9ae06a']); lamp(g, 40, ly, scanning && Math.sin(t * 6) > -0.3, ['#c28f3a', '#f6e0a0']); lamp(g, 56, ly, false, ['#a8332a', '#f08070']);
  }
}

/** the data vials and the stations dial (310 x 150 low-res, shown at 620 x 300) */
export class Vials {
  readonly cv: HTMLCanvasElement; private g: G;
  static W = 310; static H = 150;
  private lv = [0, 0, 0, 0];
  private bub: { v: number; x: number; y: number; s: number }[] = [];
  constructor() {
    this.cv = document.createElement('canvas'); this.cv.width = Vials.W; this.cv.height = Vials.H;
    this.g = this.cv.getContext('2d')!; this.g.imageSmoothingEnabled = false;
    for (let i = 0; i < 16; i++) this.bub.push({ v: i % 4, x: Math.random(), y: Math.random(), s: 6 + Math.random() * 10 });
  }
  /** slot centre x of vial i (0..3) or the dial (4) */
  static slot(i: number) { return Math.round(31 + i * 62); }
  draw(dt: number, kinds: string[], k: number[], need: (number | null)[], dial: number, live: boolean) {
    const g = this.g, H = Vials.H;
    g.clearRect(0, 0, Vials.W, H);
    block(g, 0, 0, Vials.W, H, GUN, 3);
    // the rack: a top rail the vials hang from, a bottom rail they sit in
    block(g, 6, 8, 240, 8, STEEL, 1); block(g, 6, 100, 240, 8, STEEL, 1);
    for (let i = 0; i < 4; i++) {
      this.lv[i] += (Math.max(0, Math.min(1, k[i])) - this.lv[i]) * Math.min(1, dt * 3);
      const cx = Vials.slot(i), x = cx - 11, top = 16, bot = 100, h = bot - top, L = LIQUID[kinds[i]] ?? LIQUID.bio;
      // the glass tube
      R(g, x - 1, top, 24, h, INK); R(g, x, top, 22, h, '#2a3036');
      const fy = Math.round(bot - 2 - this.lv[i] * (h - 6));
      R(g, x, fy, 22, bot - fy, L[1]); R(g, x + 2, fy, 3, bot - fy, L[2]); R(g, x + 17, fy, 4, bot - fy, L[0]);
      R(g, x, fy, 22, 1, L[2]);
      // bubbles
      for (const b of this.bub) if (b.v === i && live) {
        b.y -= dt * b.s / h; if (b.y < 0) { b.y = 1; b.x = Math.random(); }
        const by = Math.round(bot - 3 - b.y * (bot - fy - 4)); if (by > fy + 1) R(g, x + 4 + Math.round(b.x * 13), by, 2, 2, L[2]);
      }
      // the glass glint and the graduations
      R(g, x + 6, top + 2, 1, h - 6, 'rgba(255,255,255,0.35)');
      for (let yy = bot - 8; yy > top + 4; yy -= 8) R(g, x + 22 - 5, yy, 4, 1, 'rgba(230,236,240,0.55)');
      // the collar and the brass cap on the top rail
      block(g, x - 3, top - 10, 28, 7, BRASS, 1);
      // the level the selected tech needs
      const n = need[i];
      if (n != null) { const ny = Math.round(bot - 2 - Math.min(1, n) * (h - 6)); R(g, x - 6, ny - 2, 4, 5, INK); R(g, x - 5, ny - 1, 2, 3, BRASS[3]); R(g, x + 24, ny - 2, 4, 5, INK); R(g, x + 25, ny - 1, 2, 3, BRASS[3]); }
    }
    // the stations dial: a steel bezel, a cream face, ticks and a needle (0 .. 3x)
    const cx = Vials.slot(4), cy = 56, r = 24;
    for (let y = -r - 3; y <= r + 3; y++) for (let x = -r - 3; x <= r + 3; x++) {
      const d = Math.hypot(x, y);
      const c = d <= r - 3 ? CREAM[2] : d <= r ? ((x + y) < 0 ? STEEL[4] : STEEL[2]) : d <= r + 1.5 ? INK : null;
      if (c) R(g, cx + x, cy + y, 1, 1, c);
    }
    for (let i = 0; i <= 6; i++) { const a = Math.PI * (0.8 + i * 0.233), tx = cx + Math.cos(a) * (r - 6), ty = cy + Math.sin(a) * (r - 6); R(g, tx - 1, ty - 1, 2, 2, i >= 5 ? '#a8332a' : INK); }
    const a = Math.PI * (0.8 + Math.max(0, Math.min(3, dial)) / 3 * 1.4);
    for (let s = 0; s < r - 7; s++) R(g, cx + Math.cos(a) * s, cy + Math.sin(a) * s, 2, 2, '#a8332a');
    R(g, cx - 2, cy - 2, 5, 5, INK); R(g, cx - 1, cy - 1, 3, 3, BRASS[3]);
  }
}

/** the rotary card drum (210 x 140 low-res, drawn 2x on a 420 x 280 canvas so the card icons keep their own pixels) */
export class Drum {
  readonly cv: HTMLCanvasElement; private g: G; private lo = low(210, 140);
  rot = 0; private last: string[] = [];
  constructor() { this.cv = document.createElement('canvas'); this.cv.width = 420; this.cv.height = 280; this.g = this.cv.getContext('2d')!; this.g.imageSmoothingEnabled = false; }
  /** queue: tech icons in order (head first); frac: the head's progress */
  draw(dt: number, ids: string[], icons: string[], frac: number) {
    // the drum turns one card when the head is done, and twitches when the order changes
    if (this.last.length && ids[0] !== this.last[0]) this.rot = ids[0] && ids[0] === this.last[1] ? 1 : 0.5;
    this.last = ids.slice();
    this.rot += (0 - this.rot) * Math.min(1, dt * 2.6); if (Math.abs(this.rot) < 0.002) this.rot = 0;
    const g = this.lo.g, W = 210, H = 140, cy = 70, Rr = 48, step = Math.PI / 4, x0 = 34, x1 = 176;
    g.clearRect(0, 0, W, H);
    block(g, 0, 0, W, H, GUN, 3);
    // the drum's window: a dark well with a steel surround
    block(g, 24, 12, 162, 116, STEEL, 2); R(g, 27, 15, 156, 110, '#121518');
    // the cards round the reel, back to front
    const faces: { th: number; i: number }[] = [];
    for (let i = -2; i < 6; i++) faces.push({ th: -(i + this.rot) * step, i });
    faces.sort((a, b) => Math.cos(a.th) - Math.cos(b.th));
    const hFace = 2 * Rr * Math.tan(step / 2);
    const draws: { y: number; h: number; i: number; lit: number }[] = [];
    for (const f of faces) {
      const c = Math.cos(f.th); if (c < 0.12) continue;
      const yc = cy - Rr * Math.sin(f.th), h = Math.max(2, Math.round(hFace * c)), y = Math.round(yc - h / 2);
      const lit = 0.45 + 0.55 * c, tone = (k: number) => shade(CREAM[k], lit);
      R(g, x0, y, x1 - x0, h, INK);
      R(g, x0 + 1, y + 1, x1 - x0 - 2, h - 2, tone(f.i >= 0 && f.i < ids.length ? 2 : 1));
      if (h > 6) { R(g, x0 + 1, y + 1, x1 - x0 - 2, 1, tone(3)); R(g, x0 + 1, y + h - 2, x1 - x0 - 2, 1, tone(0)); }
      // the head card's progress strip
      if (f.i === 0 && ids.length && h > 10) { R(g, x0 + 34, y + h - 7, 100, 4, INK); R(g, x0 + 35, y + h - 6, Math.round(98 * frac), 2, AMBER[2]); }
      draws.push({ y, h, i: f.i, lit });
    }
    // shade the top and bottom of the well (the reel curves away)
    for (let k = 0; k < 18; k++) { g.fillStyle = `rgba(10,12,14,${0.5 - k * 0.028})`; g.fillRect(27, 15 + k, 156, 1); g.fillRect(27, 124 - k, 156, 1); }
    // pointers at the reading line
    for (const [px, d] of [[27, 1], [182, -1]] as const) for (let k = 0; k < 4; k++) R(g, px + (d > 0 ? 0 : -k), cy - 3 + k, 1 + k, 7 - 2 * k, k ? AMBER[2] : INK);
    // the axle brackets and the geared wheel on the right
    block(g, 6, 50, 14, 40, STEEL, 1); bolt(g, 13, 70);
    block(g, 190, 50, 14, 40, STEEL, 1);
    gear(g, 197, 70, 17, 12, this.rot * step * 3);
    // up to the screen at 2x, then the card icons at their own resolution
    const G2 = this.g; G2.clearRect(0, 0, 420, 280); G2.drawImage(this.lo.c, 0, 0, 420, 280);
    for (const d of draws) {
      if (d.i < 0 || d.i >= icons.length || d.h < 8) continue;
      const ih = Math.round(48 * Math.min(1, (d.h * 2 - 8) / 48)); if (ih < 6) continue;
      G2.globalAlpha = Math.min(1, d.lit + 0.1); G2.drawImage(iconCanvas(icons[d.i], 'phos'), x0 * 2 + 12, d.y * 2 + d.h - ih / 2, 48, ih); G2.globalAlpha = 1;
    }
  }
}
function shade(hex: string, k: number) { const n = parseInt(hex.slice(1), 16), f = (v: number) => Math.round(Math.min(255, v * k)); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }
/** a spur gear with `n` teeth, pixel by pixel, lit from the upper left */
function gear(g: G, cx: number, cy: number, r: number, n: number, ang: number) {
  const tw = (Math.PI * 2) / n;
  for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
    const d = Math.hypot(x, y), a = Math.atan2(y, x) - ang, ph = ((a % tw) + tw) % tw;
    const tooth = ph < tw * 0.5, rr = tooth ? r : r - 3;
    if (d > rr + 1 || d < 3) continue;
    const c = d > rr ? INK : d < 5 ? INK : d > rr - 1.2 ? (x + y < 0 ? STEEL[4] : STEEL[1]) : (x + y < -4 ? STEEL[3] : x + y > 6 ? STEEL[1] : STEEL[2]);
    R(g, cx + x, cy + y, 1, 1, c);
  }
  for (let k = 0; k < 4; k++) { const a = ang + k * Math.PI / 2; R(g, cx + Math.round(Math.cos(a) * 8) - 1, cy + Math.round(Math.sin(a) * 8) - 1, 2, 2, STEEL[0]); }
}
