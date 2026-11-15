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
