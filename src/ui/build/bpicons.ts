// BUILD MODE ICONS: small physical objects painted as clean pixel art (flat material shapes rasterised from distance
// fields at 24 x 24 art px, then lit from the upper left with the kit's sprite shader: bevelled height, warm lights and
// cool shadows, dithered, a 1 px ink outline), shown at 2 CSS px per art px. And the FLOATING ICON BUTTON
// (Limbophobia's floatIcon): the object hangs over a soft shadow and bobs; under the pointer it lifts, grows and
// brightens; pressed it dips; locked it shakes. No key, tile or frame around it; its short name (if any) floats under it.
import { Px, shadeSprite, INK } from '../kit/px';
import { RAMPS as P } from '../../art/palette';
import { play } from './juice';

export type BpIcon = 'move' | 'rotate' | 'info' | 'pause' | 'play' | 'dismantle' | 'cancel' | 'lock' | 'flask' | 'cog' | 'star' | 'bolt' | 'check' | 'jack' | 'up' | 'worker' | 'hand' | 'clock' | 'exit';
type Shape = (x: number, y: number) => number; // a colour or -1

const S = 24;
// signed distance helpers (pixel centres)
const seg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
};
const inTri = (px: number, py: number, a: number[], b: number[], c: number[]) => {
  const s = (p1: number[], p2: number[]) => (px - p2[0]) * (p1[1] - p2[1]) - (p1[0] - p2[0]) * (py - p2[1]);
  const d1 = s(a, b), d2 = s(b, c), d3 = s(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
const inPoly = (px: number, py: number, pts: number[][]) => {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
};
const box = (px: number, py: number, x0: number, y0: number, x1: number, y1: number) => px >= x0 && px <= x1 && py >= y0 && py <= y1;

const STEEL = P.steel[5], STEEL_D = P.steel[3], BRASS = P.brass[4], BRASS_L = P.brass[5], RED = P.coral[3], RED_D = P.stampRed[2];
const GREEN = P.malachite[4], BLUE = P.sapphire[3], BLUE_L = P.sapphire[5], WHITE = P.quartz[5], AMBER = P.glowAmber[3], GLASS = P.quartz[3], WOOD = P.soil[4];

const SHAPES: Record<BpIcon, Shape> = {
  move: (x, y) => {
    const c = 11.5;
    if (Math.hypot(x - c, y - c) < 3.6) return BRASS;
    if (inTri(x, y, [c, 0.5], [c - 5.5, 6], [c + 5.5, 6]) || inTri(x, y, [c, 23], [c - 5.5, 17.5], [c + 5.5, 17.5]) || inTri(x, y, [0.5, c], [6, c - 5.5], [6, c + 5.5]) || inTri(x, y, [23, c], [17.5, c - 5.5], [17.5, c + 5.5])) return STEEL;
    if (Math.abs(x - c) < 1.6 && y > 4 && y < 20 || Math.abs(y - c) < 1.6 && x > 4 && x < 20) return STEEL_D;
    return -1;
  },
  rotate: (x, y) => {
    const c = 11.5, d = Math.hypot(x - c, y - c + 0.5), a = Math.atan2(y - c + 0.5, x - c);
    if (inTri(x, y, [21.5, 4], [21.8, 12.6], [13.6, 8.2])) return BRASS_L;
    if (d > 5.2 && d < 8.8 && !(a > -1.25 && a < -0.15)) return BRASS;
    return -1;
  },
  info: (x, y) => {
    if (box(x, y, 3, 2, 20, 5.2)) return BLUE_L; // the roll
    if (box(x, y, 4, 5, 19, 21)) {
      // the sheet with a white drawing on it: a frame and a little gabled shed
      if ((x === 5.5 || x === 17.5) && y > 6 && y < 20 || (y === 6.5 || y === 19.5) && x > 5 && x < 18) return WHITE;
      if (seg(x, y, 7.5, 12.5, 11.5, 8.5) < 0.6 || seg(x, y, 11.5, 8.5, 15.5, 12.5) < 0.6 || (x === 8.5 || x === 14.5) && y > 12 && y < 18 || y === 17.5 && x > 8 && x < 15) return WHITE;
      return BLUE;
    }
    return -1;
  },
  pause: (x, y) => (box(x, y, 5, 4, 9.6, 19.6) || box(x, y, 14, 4, 18.6, 19.6) ? AMBER : -1),
  play: (x, y) => (inTri(x, y, [6, 3.5], [6, 20.5], [20, 12]) ? GREEN : -1),
  dismantle: (x, y) => {
    // a crowbar across a hex bolt
    const bx = 7.5, by = 16.5;
    if (Math.abs(x - bx) + Math.abs(y - by) * 0.6 < 4.6 && Math.hypot(x - bx, y - by) < 4.4) return Math.hypot(x - bx, y - by) < 1.4 ? STEEL_D : STEEL;
    if (seg(x, y, 7, 20, 17.5, 5.5) < 1.8) return RED;
    const d = Math.hypot(x - 19.5, y - 7.5), a = Math.atan2(y - 7.5, x - 19.5);
    if (d > 1.8 && d < 4.2 && a > -3.2 && a < 0.4) return RED;
    if (seg(x, y, 7, 20, 4.5, 22) < 1.2 || seg(x, y, 7, 20, 9, 22.5) < 1.2) return RED_D;
    return -1;
  },
  cancel: (x, y) => (seg(x, y, 5, 5, 18.5, 18.5) < 2.3 || seg(x, y, 18.5, 5, 5, 18.5) < 2.3 ? RED : -1),
  lock: (x, y) => {
    const d = Math.hypot(x - 11.5, y - 10);
    if (y < 11 && d > 3.6 && d < 6.6) return STEEL;
    if (box(x, y, 4, 10.5, 19, 21.5)) {
      if (Math.hypot(x - 11.5, y - 14.5) < 1.7 || box(x, y, 11, 14.5, 12, 18.5)) return INK;
      return BRASS;
    }
    return -1;
  },
  flask: (x, y) => {
    const d = Math.hypot(x - 11.5, y - 15.5);
    if (box(x, y, 9, 2, 14, 4)) return STEEL;
    if (box(x, y, 9.5, 4, 13.5, 10.5)) return GLASS;
    if (d < 7.2) return y > 14 ? GREEN : GLASS;
    return -1;
  },
  cog: (x, y) => {
    const c = 11.5, d = Math.hypot(x - c, y - c), a = Math.atan2(y - c, x - c);
    if (d < 2.6) return -1;
    if (d < 7) return STEEL;
    if (d < 10 && Math.cos(a * 8) > 0.25) return STEEL_D;
    return -1;
  },
  star: (x, y) => {
    const pts: number[][] = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 4.2 : 10.5; pts.push([11.5 + Math.cos(a) * r, 12.5 + Math.sin(a) * r]); }
    return inPoly(x, y, pts) ? AMBER : -1;
  },
  bolt: (x, y) => (inPoly(x, y, [[13, 1.5], [5, 13.5], [11, 13.5], [9, 22.5], [19, 9], [13, 9], [16, 1.5]]) ? AMBER : -1),
  check: (x, y) => (seg(x, y, 4.5, 12.5, 9.5, 18) < 2.2 || seg(x, y, 9.5, 18, 19.5, 5.5) < 2.2 ? GREEN : -1),
  jack: (x, y) => {
    if (seg(x, y, 3, 21, 9, 15) < 2.2) return INK;
    if (seg(x, y, 9, 15, 15, 9) < 3.2) return STEEL;
    if (seg(x, y, 15, 9, 20, 4) < 1.4) return BRASS_L;
    return -1;
  },
  up: (x, y) => (inPoly(x, y, [[11.5, 3], [21, 13], [16, 13], [16, 21], [7, 21], [7, 13], [2, 13]]) ? GREEN : -1),
  worker: (x, y) => {
    if (Math.hypot(x - 11.5, y - 7) < 4.2) return P.hide[4];
    if (y > 12 && Math.hypot((x - 11.5) * 0.85, y - 22) < 10) return P.olive[4];
    return -1;
  },
  hand: (x, y) => {
    if (box(x, y, 6, 11, 18, 21) && !(x > 17 && y > 19)) return P.hide[4];
    for (const fx of [6.5, 9.5, 12.5, 15.5]) if (box(x, y, fx - 1.2, fx === 6.5 ? 7 : 4, fx + 1.2, 12)) return P.hide[4];
    if (seg(x, y, 18, 16, 21, 11) < 1.5) return P.hide[4];
    return -1;
  },
  clock: (x, y) => {
    const d = Math.hypot(x - 11.5, y - 11.5);
    if (d < 9.5 && d > 7.6) return BRASS;
    if (d <= 7.6) { if (seg(x, y, 11.5, 11.5, 11.5, 5.5) < 0.9 || seg(x, y, 11.5, 11.5, 16, 13.5) < 0.9) return INK; return P.paper[5]; }
    return -1;
  },
  exit: (x, y) => {
    if (box(x, y, 3, 3, 13, 21) && !box(x, y, 5, 5, 11, 19)) return WOOD;
    if (seg(x, y, 9, 12, 19, 12) < 1.6 || inTri(x, y, [22, 12], [16.5, 6.5], [16.5, 17.5])) return GREEN;
    return -1;
  },
};

const cache = new Map<string, string>();
/** the icon as a data URL, 24 x 24 art px (show it at 48 CSS px) */
export function bpIcon(name: BpIcon, tint?: 'dim' | 'hot'): string {
  const key = name + (tint ?? '');
  const hit = cache.get(key); if (hit) return hit;
  const p = new Px(S + 2, S + 2), f = SHAPES[name];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const c = f(x + 0.5, y + 0.5); if (c >= 0) p.set(x + 1, y + 1, c); }
  shadeSprite(p, { bevel: 2, light: 1.1, seed: name.length * 7 });
  if (tint === 'dim') for (let i = 0; i < p.d.length; i += 4) { const l = p.d[i] * 0.3 + p.d[i + 1] * 0.59 + p.d[i + 2] * 0.11; p.d[i] = p.d[i + 1] = p.d[i + 2] = l * 0.55; }
  const url = p.url();
  cache.set(key, url);
  return url;
}

// ------------------------------------------------------------------ the floating icon button
export interface FloatBtn extends HTMLButtonElement { lock(v: boolean): void; on(v: boolean): void; ping(): void }
/** an icon hanging over its shadow, its name (optional) floating under it; size in CSS px (multiple of 24) */
export function floatBtn(icon: BpIcon | string, name: string, fn: () => void, o: { size?: number; cls?: string; nameHover?: boolean; sound?: string } = {}): FloatBtn {
  const b = document.createElement('button') as FloatBtn;
  b.type = 'button';
  b.className = 'bfi' + (o.nameHover ? ' bfi-nh' : '') + (o.cls ? ' ' + o.cls : '');
  b.style.setProperty('--ph', (Math.random() * -4).toFixed(2) + 's');
  b.setAttribute('aria-label', name);
  const sz = o.size ?? 48;
  const src = icon.startsWith('data:') || icon.includes('/') ? icon : bpIcon(icon as BpIcon);
  b.innerHTML = `<span class="bfi-ic"><span class="bfi-sh"></span><span class="bfi-bob"><img src="${src}" alt="" draggable="false" style="width:${sz}px;height:${sz}px"></span></span>${name ? `<span class="bfi-t">${name}</span>` : ''}`;
  let locked = false;
  b.addEventListener('pointerenter', () => { b.classList.add('hot'); play('tick', 1.1, 0.25); });
  b.addEventListener('pointerleave', () => { b.classList.remove('hot', 'down'); });
  b.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.button === 0) b.classList.add('down'); });
  b.addEventListener('pointerup', () => b.classList.remove('down'));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (locked) { play('deny', 1, 0.4); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
    play(o.sound ?? 'pick', 1, 0.45);
    fn();
  });
  b.lock = (v) => { locked = v; b.classList.toggle('lock', v); };
  b.on = (v) => b.classList.toggle('on', v);
  b.ping = () => { b.classList.remove('ping'); void b.offsetWidth; b.classList.add('ping'); };
  return b;
}
