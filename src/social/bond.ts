// THE BOND METER: whenever closeness moves, a small brass tag rises over the person (or beside the subtitle face
// when they are off screen): their portrait, five riveted pips for the level, a glass cell bar that fills to the new
// value with a glint, the gain as a rolling number, and little pixel hearts that float up. A level up fills its pip
// with a pop and shows the icon of what that bond now opens on the skill tree.
import type { Social } from './social';
import { PEOPLE, LEVELS } from './social';
import { Px, P, INK, rivet, cellBar } from '../ui/kit/px';
import { strip } from '../ui/kit/mat';
import { bitText } from '../ui/kit/bitfont';
import { uiSfx } from '../ui/kit/sound';
import { portrait } from './portrait';
import { iconCanvas } from '../research/ui/icons';
import { NODES } from '../research/unlocks';

const CSS = `.bond7 { position: fixed; z-index: 660; pointer-events: none; transform: translate(-50%, -100%); transition: opacity .3s; image-rendering: pixelated; }
.bond7 canvas { display: block; image-rendering: pixelated; }
.bond7.out { opacity: 0; }`;
const LIT = [...P.glowAmber, 0xfff2c8, 0xffffff];
const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
interface Show { id: string; from: number; to: number; gain: number; t: number; up: boolean; el: HTMLDivElement; cv: HTMLCanvasElement; hearts: { x: number; y: number; vy: number; t: number }[] }
export class BondMeter {
  private shows = new Map<string, Show>();
  private raf = 0; private last = 0;
  /** where a person's head is on screen (null: off screen) */
  anchor: ((id: string) => [number, number] | null) | null = null;
  constructor(readonly social: Social) {
    if (!document.getElementById('bond7-css')) { const s = document.createElement('style'); s.id = 'bond7-css'; s.textContent = CSS; document.head.append(s); }
    social.on('change', (d: { id: string; v: number; n: number }) => { if (Math.abs(d.n) >= 1) this.show(d.id, d.v - d.n, d.v, d.n); });
    social.on('level', (d: { id: string; up: boolean }) => { const s = this.shows.get(d.id); if (s) { s.up = d.up; s.t = Math.min(s.t, 0.2); } if (d.up) setTimeout(() => uiSfx('confirm', 0.8, 1.2), 600); });
  }
  show(id: string, from: number, to: number, gain: number) {
    let s = this.shows.get(id);
    if (!s) {
      const el = document.createElement('div'); el.className = 'bond7'; const cv = document.createElement('canvas'); el.append(cv); document.body.append(el);
      s = { id, from, to, gain: 0, t: 0, up: false, el, cv, hearts: [] };
      this.shows.set(id, s);
    } else { s.from = Math.min(s.from, from); s.to = to; s.t = Math.min(s.t, 0.4); s.el.classList.remove('out'); }
    s.gain += gain;
    for (let i = 0; i < Math.min(6, 1 + Math.round(Math.abs(gain) / 2)); i++) s.hearts.push({ x: 40 + Math.random() * 40, y: 30, vy: 18 + Math.random() * 14, t: -i * 0.12 });
    if (gain > 0) uiSfx('pluck', 0.6, 1.3);
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.tick); }
  }
  private tick = (now: number) => {
    this.raf = 0;
    const dt = Math.max(0, Math.min(0.3, (now - this.last) / 1000)); this.last = now;
    for (const [id, s] of this.shows) {
      s.t += dt;
      if (s.t > 3.6) s.el.classList.add('out');
      if (s.t > 4.0) { s.el.remove(); this.shows.delete(id); continue; }
      const k = Math.min(1, Math.max(0, (s.t - 0.25) / 0.9)), e = 1 - Math.pow(1 - k, 3);
      this.paint(s, s.from + (s.to - s.from) * e, dt);
      const a = this.anchor?.(id) ?? [innerWidth / 2, 150];
      s.el.style.left = Math.round(a[0]) + 'px'; s.el.style.top = Math.round(a[1] - 8 - Math.min(1, s.t * 4) * 10) + 'px';
    }
    if (this.shows.size) this.raf = requestAnimationFrame(this.tick);
  };
  private paint(s: Show, v: number, dt: number) {
    const W = 92, H = 52, p = new Px(W, H);
    // the brass tag
    p.blit(strip(W, 30, 'brass', 7), 0, H - 30);
    const face = portrait(s.id);
    // the level pips (riveted sockets; a lit one is a glowing amber lamp)
    let lv = 0; for (let i = 0; i < LEVELS.length; i++) if (v >= LEVELS[i]) lv = i;
    for (let i = 0; i < 5; i++) {
      const x = 34 + i * 10, y = H - 22;
      rivet(p, x, y, 2, i < lv ? LIT : P.steel);
    }
    // the bar to the next level
    const nx = LEVELS[Math.min(LEVELS.length - 1, lv + 1)], frac = lv >= 5 ? 1 : (v - LEVELS[lv]) / Math.max(1, nx - LEVELS[lv]);
    cellBar(p, 30, H - 14, 52, 7, frac, P.glowAmber, s.t);
    // hearts floating up
    for (const h of s.hearts) {
      h.t += dt; if (h.t < 0) continue;
      h.y -= h.vy * dt; h.x += Math.sin(h.t * 6 + h.vy) * 0.3;
      if (h.t > 1.4) continue;
      HEART.forEach((r, j) => [...r].forEach((c, i) => { if (c === '#') p.set(Math.round(h.x) + i, Math.round(h.y) + j, j < 2 && i < 3 ? P.coral[5] : P.coral[3]); }));
      for (let j = -1; j <= HEART.length; j++) for (let i = -1; i <= 7; i++) { const x = Math.round(h.x) + i, y = Math.round(h.y) + j; if (p.alpha(x, y) === 0 && ((HEART[j]?.[i - 1] === '#') || (HEART[j]?.[i + 1] === '#') || (HEART[j - 1]?.[i] === '#') || (HEART[j + 1]?.[i] === '#'))) p.set(x, y, INK); }
    }
    const cv = s.cv; cv.width = W; cv.height = H;
    const g = cv.getContext('2d')!; g.imageSmoothingEnabled = false;
    g.putImageData(p.image(), 0, 0);
    if (face) g.drawImage(face, 0, H - 36, 32, 32);
    // the gain, rolling
    const shown = Math.round(s.gain * Math.min(1, s.t / 0.8));
    bitText(g, (shown >= 0 ? '+' : '') + shown, 60, 2, { color: shown >= 0 ? '#ffd27a' : '#ff7a5a', align: 'center' });
    // a level up: what the bond opens now
    if (s.up && s.t > 0.6) {
      const n = NODES.find((x) => x.close && x.close[0] === s.id && x.close[1] === lv);
      if (n) { const ic = iconCanvas(n.icon, 'phos'); g.drawImage(ic, W - 26, 0, 24, 24); }
    }
    cv.style.width = W * 2 + 'px'; cv.style.height = H * 2 + 'px';
    void PEOPLE;
  }
}
