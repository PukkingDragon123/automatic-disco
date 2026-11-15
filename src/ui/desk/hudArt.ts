// Painted pieces of the colony HUD's hardware: the worn olive enamel plate (chips to primer and bare steel along
// stamped edges, a few brush runs, no noise), slotted screw heads, the riveted steel bezel, and icon canvases from the
// shared vignettes. Everything is drawn once per size at device resolution and reused as CSS backgrounds.
import { hiIcon } from '../icons';

const URL_CACHE = new Map<string, string>();
function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function cv(w: number, h: number) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; return [c, g] as const; }

/** a tileable enamel texture (olive or gunmetal), 256 px: brush runs, chips showing primer and steel */
export function enamelURL(kind: 'olive' | 'gun' | 'steel' = 'olive') {
  const k = 'en' + kind; let u = URL_CACHE.get(k); if (u) return u;
  const [c, g] = cv(256, 256), r = rng(kind.length * 31 + 7);
  const base = kind === 'olive' ? ['#4d5038', '#484b34', '#52553c', '#45482f'] : kind === 'gun' ? ['#3a3d40', '#36393c', '#3e4144', '#333638'] : ['#5d6064', '#585b5f', '#63666a', '#55585b'];
  g.fillStyle = base[0]; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 420; i++) { g.fillStyle = base[1 + Math.floor(r() * 3)]; g.fillRect(Math.floor(r() * 256), Math.floor(r() * 256), 8 + Math.floor(r() * 40), 1); }
  for (let i = 0; i < 26; i++) { const x = Math.floor(r() * 256), y = Math.floor(r() * 256), w = 2 + Math.floor(r() * r() * 7), h = 1 + Math.floor(r() * 3); g.fillStyle = r() < 0.5 ? '#6b6a58' : '#8d8f8a'; g.fillRect(x, y, w, h); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + h, w, 1); }
  u = c.toDataURL(); URL_CACHE.set(k, u); return u;
}
/** a slotted screw head, 12 px, the slot at a random-looking but fixed angle */
export function screwURL(seed = 0) {
  const k = 'sc' + (seed % 4); let u = URL_CACHE.get(k); if (u) return u;
  const [c, g] = cv(12, 12);
  const px = (x: number, y: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const dx = x - 5.5, dy = y - 5.5, d = Math.hypot(dx, dy);
    if (d > 5.2) continue;
    const lit = -dx * 0.6 - dy * 0.8;
    px(x, y, d > 4.4 ? '#1e2022' : lit > 1.5 ? '#c9cbc6' : lit > -1 ? '#9a9d9b' : '#6c6f6e');
  }
  const a = [0.4, 1.1, 2.3, 2.9][seed % 4];
  for (let t = -3.2; t <= 3.2; t += 0.5) { const x = Math.round(5.5 + Math.cos(a) * t), y = Math.round(5.5 + Math.sin(a) * t); px(x, y, '#2a2c2e'); }
  u = c.toDataURL(); URL_CACHE.set(k, u); return u;
}
const ICON_CV = new Map<string, HTMLCanvasElement>();
/** a vignette as a canvas (for drawing into other canvases) */
export function iconCanvas(name: string, px: number, dim = false): HTMLCanvasElement | null {
  const key = name + '|' + px + (dim ? 'd' : ''); let c = ICON_CV.get(key); if (c) return c;
  const pc = hiIcon(name, px, { shadow: true, dim }); if (!pc) return null;
  const [cc, g] = cv(pc.w, pc.h); g.putImageData(pc.toImageData(), 0, 0); ICON_CV.set(key, cc); return cc;
}
/** icons rendered from the lowpix models (tools/lowpix -> public/icons/colony; `_s` is the ~56 px render) */
const LOWPIX: Record<string, string> = {
  't-scanner': 'scanner', 't-sampler': 'sampler', 't-seeder': 'seeder', 't-grab': 'grab', 't-drill': 'drill', 't-weld': 'weld', 't-lift': 'lift', 't-cannon': 'cannon', 't-carry': 'carry',
  't-scout': 'drone_scout', 't-carrier': 'drone_carrier', 't-repairdrone': 'drone_repair', 't-pole': 'st_gravpole', 't-relay': 'st_relay', 't-lamp': 'st_lamp', 't-sensor': 'st_sensor', 'u-pod': 'pod',
};
const IMGS = new Map<string, HTMLImageElement>();
/** the lowpix render for an icon name (small: the ~56 px one), or null; it may still be loading (check .complete) */
export function lowpixIcon(name: string, small = true): HTMLImageElement | null {
  const f = LOWPIX[name]; if (!f) return null;
  const k = f + (small ? '_s' : ''); let i = IMGS.get(k);
  if (!i) { i = new Image(); i.src = `${import.meta.env.BASE_URL ?? '/'}icons/colony/${k}.png`; IMGS.set(k, i); }
  return i;
}
/** an <img> of an icon in a px box: the lowpix render at its own size (never resampled), else the painted vignette */
export function iconImg(name: string, px: number, cls = 'cx-ico') {
  const i = document.createElement('img'); i.className = cls; i.width = px; i.height = px; i.draggable = false; i.style.objectFit = 'none';
  const lp = lowpixIcon(name, px < 70);
  if (lp) i.src = lp.src;
  else { const c = iconCanvas(name, px); if (c) i.src = c.toDataURL(); }
  return i;
}
/** four screws in the corners of a plate */
export function screws(el: HTMLElement, inset = 5) {
  ['tl', 'tr', 'bl', 'br'].forEach((k, i) => { const s = document.createElement('i'); s.className = 'cx-screw ' + k; s.style.backgroundImage = `url(${screwURL(i + el.className.length)})`; s.style.setProperty('--in', inset + 'px'); el.appendChild(s); });
}
