// Hand-drawn pixel-art strokes for the crew and intro UI: ink lines laid with a square pixel brush along a wobbling
// pen path (a dark outline pass, then the light ink), loops drawn round a target in one overshooting stroke, curved
// arrows with a two-flick head, leader lines that end in a dot, a strip of tape. No panels, no glow: the scene is
// the star and these are the pen marks over it. Drawings "boil" (redrawn with a new wobble a few times a second) like
// hand-drawn animation. Text is the house faces only (Departure Mono 'Body' 22, Spleen 'Title' 24 / 48), binarised
// and outlined so it reads on any background.
import { Px, DPR } from '../intro/hw';

export const INK = { light: '#efe6cf', dark: '#1a1714', amber: '#e8a83a', violet: '#a99cff', red: '#d8553e', mute: '#b8ae96' };
const h1 = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
type P2 = [number, number];

/** a canvas with a pen: whole-pixel square-brush strokes (outline pass under the ink pass) */
export class Ink extends Px {
  seed = 1;
  /** a smooth wobble along a path: offsets that drift, never jitter */
  private wob(i: number, amp: number) { const s = this.seed; return [(Math.sin(i * 0.21 + s * 1.7) + Math.sin(i * 0.53 + s * 4.1) * 0.5) * amp, (Math.cos(i * 0.19 + s * 2.3) + Math.sin(i * 0.47 + s * 0.9) * 0.5) * amp]; }
  /** stamp a square brush along a polyline; reveal 0..1 draws only the first part (it draws itself) */
  stroke(pts: P2[], w: number, col: string, o: { outline?: string; amp?: number; reveal?: number; taper?: boolean } = {}) {
    const amp = o.amp ?? 1.2, rev = Math.max(0, Math.min(1, o.reveal ?? 1));
    // resample at 1 px
    const path: P2[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], L = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay)));
      for (let k = 0; k < L; k++) path.push([ax + ((bx - ax) * k) / L, ay + ((by - ay) * k) / L]);
    }
    path.push(pts[pts.length - 1]);
    const n = Math.max(1, Math.floor(path.length * rev));
    const pass = (ww: number, c: string) => {
      for (let i = 0; i < n; i++) {
        const [dx, dy] = this.wob(i, amp);
        const t = o.taper ? Math.min(1, Math.min(i, path.length - i) / 10) : 1;
        const bw = Math.max(1, Math.round(ww * (0.55 + 0.45 * t)));
        const x = Math.round(path[i][0] + dx - bw / 2), y = Math.round(path[i][1] + dy - bw / 2);
        this.r(x, y, bw, bw, c);
      }
    };
    if (o.outline) pass(w + 2, o.outline);
    pass(w, col);
    return this;
  }
  /** a loop round a point, in one stroke that overshoots its start */
  loop(cx: number, cy: number, rx: number, ry: number, w: number, col: string, o: { outline?: string; reveal?: number; turns?: number } = {}) {
    const pts: P2[] = [], turns = o.turns ?? 1.12, a0 = -2.2 + h1(this.seed, 3) * 0.6, n = Math.max(24, Math.round((rx + ry) * 1.2));
    for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI * 2 * turns, k = 1 + (i / n) * 0.08 * Math.sin(this.seed); pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
    return this.stroke(pts, w, col, { outline: o.outline, reveal: o.reveal, amp: 1.4, taper: true });
  }
  /** a curved arrow from a to b (bend: sideways bow in px), with a two-flick head */
  arrow(a: P2, b: P2, w: number, col: string, o: { outline?: string; bend?: number; reveal?: number } = {}) {
    const [ax, ay] = a, [bx, by] = b, bend = o.bend ?? 30;
    const mx = (ax + bx) / 2, my = (ay + by) / 2, L = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / L, ny = (bx - ax) / L;
    const cx = mx + nx * bend, cy = my + ny * bend;
    const pts: P2[] = []; for (let i = 0; i <= 24; i++) { const t = i / 24, u = 1 - t; pts.push([u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by]); }
    this.stroke(pts, w, col, { outline: o.outline, reveal: o.reveal, taper: false });
    if ((o.reveal ?? 1) >= 0.95) {
      const dx = bx - pts[22][0], dy = by - pts[22][1], dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl, hs = 12 + w * 2;
      for (const s of [1, -1]) this.stroke([[bx, by], [bx - ux * hs + uy * hs * 0.6 * s, by - uy * hs - ux * hs * 0.6 * s]], w, col, { outline: o.outline, amp: 0.6 });
    }
    return this;
  }
  /** a leader line from a label to a point, ending in a dot on the thing */
  leader(a: P2, b: P2, col: string, outline = INK.dark) {
    this.stroke([a, [(a[0] + b[0]) / 2 + (h1(this.seed, 8) - 0.5) * 8, (a[1] + b[1]) / 2], b], 2, col, { outline, amp: 0.8 });
    this.r(b[0] - 3, b[1] - 3, 7, 7, outline).r(b[0] - 2, b[1] - 2, 5, 5, col);
    return this;
  }
  /** outlined text in a house face: the dark ring then the ink */
  label(s: string, x: number, y: number, face: 'Body' | 'Title' | 'TitleL', size: number, col: string, align: 'left' | 'center' | 'right' = 'left') {
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]]) this.text(s, x + dx, y + dy, face, size, INK.dark, { align });
    return this.text(s, x, y, face, size, col, { align });
  }
  /** a strip of masking tape (a torn-edged cream band) */
  tape(x: number, y: number, w: number, h: number, ang = -0.12) {
    const g = this.g; g.save(); g.translate(Math.round(x + w / 2), Math.round(y + h / 2)); g.rotate(ang);
    g.fillStyle = 'rgba(214, 204, 172, 0.82)'; g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = 'rgba(120, 110, 90, 0.35)'; for (let i = 0; i < w; i += 3) { g.fillRect(-w / 2 + i, -h / 2 - (i % 6 ? 0 : 1), 2, 1); g.fillRect(-w / 2 + i, h / 2 - 1 + (i % 9 ? 0 : 1), 2, 1); }
    g.restore();
    return this;
  }
}

/** measure a label's width in a house face (px) */
export function textW(s: string, face: 'Body' | 'Title' | 'TitleL', size: number) {
  const g = document.createElement('canvas').getContext('2d')!; g.font = `${size}px '${face}', monospace`; return Math.ceil(g.measureText(s).width);
}
export { DPR };

// ------------------------------------------------------------------ the crew ID badge (a laminated card on a clip)
import { crewPage, pageRegion } from './paint';
import type { CrewDef } from './roster';
const PATCH_OF: Record<string, string> = { solano: 'sci', quintero: 'unaa', kowalczyk: 'eng', castellanos: 'sparrow', baptiste: 'med', mamani: 'sci', araujo: 'sup', kristiansen: 'sec' };
const hx = (c: [number, number, number], k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;
/**
 * A crew member's ID badge, pixel art at whole pixels: a steel clip with its rivet on a punched slot, the laminated
 * card (plastic grain, a gloss streak, bevelled edges), the department band, the embroidered department patch as the
 * picture, the name, job and rank, five mood pips with a little face, and a barcode. Returns the canvas (w x h CSS px).
 */
export function idBadge(d: CrewDef, mood: number, scale = 1): HTMLCanvasElement {
  const S = Math.max(1, Math.round(scale)), W = 300, H = 176;
  const I = new Ink(W * S, H * S); const g = I.g; g.save(); g.scale(S, S);
  const r = (x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const cy = 22, ch = H - cy - 4, cw = W - 8, cx = 4;
  // shadow, card body with clipped corners
  r(cx + 4, cy + 4, cw, ch, 'rgba(10, 8, 6, 0.5)');
  r(cx + 3, cy, cw - 6, ch, '#ece7da'); r(cx, cy + 3, cw, ch - 6, '#ece7da'); r(cx + 1, cy + 1, cw - 2, ch - 2, '#ece7da');
  // plastic grain and a gloss streak across the laminate
  for (let i = 0; i < 900; i++) { const x = cx + 2 + ((i * 97) % (cw - 4)), y = cy + 2 + ((i * 53 + (i >> 3)) % (ch - 4)); r(x, y, 1, 1, i % 3 ? '#e2dccd' : '#f4f0e6'); }
  for (let i = 0; i < 26; i++) r(cx + 130 + i * 2 - (i >> 1), cy + 2 + i * 4, 18, 4, 'rgba(255, 255, 255, 0.28)');
  // bevel: lit top-left, shaded bottom-right, a dark rim
  r(cx + 3, cy, cw - 6, 1, '#fbf8f0'); r(cx, cy + 3, 1, ch - 6, '#fbf8f0');
  r(cx + 3, cy + ch - 1, cw - 6, 1, '#a8a090'); r(cx + cw - 1, cy + 3, 1, ch - 6, '#a8a090');
  // the department band with the program name
  const col = d.dept_col;
  r(cx + 1, cy + 6, cw - 2, 30, hx(col)); r(cx + 1, cy + 6, cw - 2, 2, hx(col, 1.18)); r(cx + 1, cy + 34, cw - 2, 2, hx(col, 0.7));
  for (let x = cx + 4; x < cx + cw - 4; x += 3) r(x, cy + 8 + ((x * 7) % 26), 1, 1, hx(col, 0.9));
  // the punched slot and the clip
  r(W / 2 - 15, cy + 10, 30, 6, '#3a3630'); r(W / 2 - 14, cy + 11, 28, 1, '#1a1714');
  r(W / 2 - 10, 2, 20, 22, '#6e747a'); r(W / 2 - 10, 2, 20, 2, '#b4bac0'); r(W / 2 - 10, 2, 2, 22, '#9aa0a6'); r(W / 2 + 8, 2, 2, 22, '#4a5056'); r(W / 2 - 10, 22, 20, 2, '#3a4046');
  for (let y = 6; y < 20; y += 3) r(W / 2 - 7, y, 14, 1, '#7e848a');
  r(W / 2 - 3, 10, 6, 6, '#3a4046'); r(W / 2 - 2, 11, 3, 3, '#c8ced4'); r(W / 2 - 1, 12, 1, 1, '#ffffff');
  g.restore();
  // type on the band and the card (whole pixels, outlined only where it sits on colour)
  I.label('UNAA', (cx + 10) * S, (cy + 9) * S, 'Title', 24 * S === 24 ? 24 : 48, '#f4f0e6');
  I.text('MERIDIAN RV-07', (W - 12) * S, (cy + 17) * S, 'Body', 11 * S, '#f4f0e6', { align: 'right' });
  // the picture: the department's embroidered patch from the crew page
  const pr = pageRegion('unaa') && pageRegion(PATCH_OF[d.id] ?? 'unaa');
  if (pr) {
    const src = crewPage().canvas; g.imageSmoothingEnabled = false;
    const ps = 72;
    g.fillStyle = '#d8d0bc'; g.fillRect((cx + 10) * S, (cy + 44) * S, (ps + 6) * S, (ps + 6) * S);
    g.fillStyle = '#b8ae98'; g.fillRect((cx + 10) * S, (cy + 44 + ps + 5) * S, (ps + 6) * S, S);
    g.drawImage(src, pr[0], pr[1], pr[2], pr[3], (cx + 13) * S, (cy + 47) * S, ps * S, ps * S);
  }
  const tx = cx + 96;
  I.text(d.short.toUpperCase(), tx * S, (cy + 44) * S, 'Title', 24 * S === 24 ? 24 : 48, '#1f1b17');
  I.text(d.job, tx * S, (cy + 72) * S, 'Body', 22 * S === 22 ? 22 : 44, '#3a342c');
  I.text(d.rank.toUpperCase() + ' · ' + d.heightM.toFixed(2) + ' M', tx * S, (cy + 98) * S, 'Body', 11 * S === 11 ? 11 : 22, '#7a7060');
  // mood: a little face and five pips
  g.save(); g.scale(S, S);
  const mx = tx + 8, my = cy + 124, on = Math.max(1, Math.round(mood * 5));
  const face = mood > 0.6 ? 1 : mood > 0.4 ? 0 : -1;
  r(mx - 6, my - 7, 12, 1, '#1f1b17'); r(mx - 6, my + 6, 12, 1, '#1f1b17'); r(mx - 7, my - 6, 1, 12, '#1f1b17'); r(mx + 6, my - 6, 1, 12, '#1f1b17');
  r(mx - 6, my - 6, 12, 12, '#f0c860'); r(mx - 3, my - 3, 2, 2, '#1f1b17'); r(mx + 2, my - 3, 2, 2, '#1f1b17');
  if (face === 1) { r(mx - 3, my + 2, 1, 1, '#1f1b17'); r(mx - 2, my + 3, 5, 1, '#1f1b17'); r(mx + 3, my + 2, 1, 1, '#1f1b17'); }
  else if (face === 0) r(mx - 3, my + 2, 7, 1, '#1f1b17');
  else { r(mx - 3, my + 3, 1, 1, '#1f1b17'); r(mx - 2, my + 2, 5, 1, '#1f1b17'); r(mx + 3, my + 3, 1, 1, '#1f1b17'); }
  for (let i = 0; i < 5; i++) { const c = i < on ? (mood > 0.6 ? '#5a9a5a' : mood > 0.4 ? '#c8a040' : '#b84a3a') : '#cfc8b6'; r(mx + 14 + i * 12, my - 4, 9, 9, '#1f1b17'); r(mx + 15 + i * 12, my - 3, 7, 7, c); r(mx + 15 + i * 12, my - 3, 7, 1, 'rgba(255,255,255,0.35)'); }
  // the barcode
  let bx = cx + cw - 96; const by = cy + ch - 26;
  for (let i = 0; bx < cx + cw - 12; i++) { const w = ((d.id.charCodeAt(i % d.id.length) + i * 7) % 3) + 1; if (i % 2 === 0) r(bx, by, w, 16, '#2a2622'); bx += w + 1; }
  g.restore();
  return I.c;
}
