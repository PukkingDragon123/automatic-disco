// Real materials for the gene lab's 2D panels, painted at device resolution: aged form paper with fibres and one
// coffee ring, olive-drab enamel chipped to bare steel where hands and edges wear it, a masonite clipboard, a
// cyanotype blueprint sheet, McBee edge-notched index cards (the notches encode the gene category; the window
// and the punched holes are real holes the lab shows through) and a speckled rubber-stamp ink mask. Each painter
// is sized to its element and repainted when the element resizes, so hairlines stay one device pixel wide.
import { hashi } from '../core/rand';

export const PAL = { paper: '#d9d2bf', graphite: '#3b3a36', blueLine: '#9fb4c2', redLine: '#b8382e', prussian: '#1d3b5a', bpGrid: '#2a4d70', ink: '#e8eef0', olive: '#4d5038', gun: '#3a3d40', steel: '#8d8f8a', bakelite: '#3a2418', stamp: '#b8382e', amber: '#d9a43a', phos: '#7fd48a', manila: '#c8b88e', masonite: '#6a5038' };
const dpr = () => Math.min(2, Math.max(1, window.devicePixelRatio || 1));
const rnd = (seed: number) => { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296); };
type G = CanvasRenderingContext2D;
function canvas(w: number, h: number) {
  const k = dpr(), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const g = c.getContext('2d')!; g.scale(k, k);
  return { c, g, k };
}
/** per-device-pixel grain: tone jitter plus faint fibres */
function grain(g: G, w: number, h: number, amp: number, seed: number, fibres = 0) {
  const k = dpr(), W = g.canvas.width, H = g.canvas.height, img = g.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; if (!d[i + 3]) continue;
    const n = ((hashi(x, y, seed) & 255) / 255 - 0.5) * amp + ((hashi(x >> 3, y >> 3, seed + 1) & 255) / 255 - 0.5) * amp * 0.6;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.9;
  }
  g.putImageData(img, 0, 0);
  if (fibres) {
    const r = rnd(seed); g.save(); g.lineWidth = 0.5 / k;
    for (let i = 0; i < fibres * w * h / 10000; i++) { const x = r() * w, y = r() * h, a = r() * Math.PI, l = 2 + r() * 7; g.strokeStyle = `rgba(${r() < 0.5 ? '90,80,60' : '255,250,235'},${0.06 + r() * 0.1})`; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + r() * 2, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    g.restore();
  }
}
/** a soft mottle: big low-contrast blotches (age, handling) */
function mottle(g: G, w: number, h: number, col: string, n: number, seed: number, a = 0.05) {
  const r = rnd(seed);
  for (let i = 0; i < n; i++) { const x = r() * w, y = r() * h, rr = 20 + r() * Math.max(w, h) * 0.4, gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, col.replace('A', String(a * (0.5 + r())))); gr.addColorStop(1, col.replace('A', '0')); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
}
const url = (c: HTMLCanvasElement) => `url(${c.toDataURL()})`;

// ------------------------------------------------------------------------------------------------ painters
export interface PaperOpt { tone?: string; rule?: 'none' | 'form' | 'grid'; coffee?: [number, number, number]; fold?: number; seed?: number; edge?: number; tape?: boolean }
/** aged off-white paper: fibres, mottling, a darker deckle edge; optional rules, a fold, one coffee ring, tape */
export function paper(w: number, h: number, o: PaperOpt = {}) {
  const { c, g } = canvas(w, h), seed = o.seed ?? 7, r = rnd(seed);
  g.fillStyle = o.tone ?? PAL.paper; g.fillRect(0, 0, w, h);
  mottle(g, w, h, 'rgba(150,130,90,A)', 5, seed, 0.06);
  const lamp = g.createLinearGradient(0, 0, w * 0.4, h); lamp.addColorStop(0, 'rgba(255,248,230,0.10)'); lamp.addColorStop(1, 'rgba(60,50,30,0.07)'); g.fillStyle = lamp; g.fillRect(0, 0, w, h);
  if (o.rule === 'grid') { g.strokeStyle = 'rgba(122,150,170,0.32)'; g.lineWidth = 0.5; for (let x = 6; x < w; x += 6) { g.globalAlpha = x % 30 < 6 ? 0.9 : 0.45; g.beginPath(); g.moveTo(x + 0.25, 0); g.lineTo(x + 0.25, h); g.stroke(); } for (let y = 6; y < h; y += 6) { g.globalAlpha = y % 30 < 6 ? 0.9 : 0.45; g.beginPath(); g.moveTo(0, y + 0.25); g.lineTo(w, y + 0.25); g.stroke(); } g.globalAlpha = 1; }
  if (o.fold !== undefined) { const y = o.fold; const fg = g.createLinearGradient(0, y - 3, 0, y + 3); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.45, 'rgba(70,60,40,0.10)'); fg.addColorStop(0.55, 'rgba(255,250,235,0.16)'); fg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fg; g.fillRect(0, y - 3, w, 6); }
  if (o.coffee) {
    const [cx, cy, cr] = o.coffee;
    for (let i = 0; i < 260; i++) { const a = (i / 260) * Math.PI * 2, wob = Math.sin(a * 3 + 1) * 1.2 + Math.sin(a * 7) * 0.5, gap = Math.sin(a * 2 + 0.6) > 0.82; if (gap) continue; g.fillStyle = `rgba(120,78,40,${0.10 + 0.12 * (0.5 + 0.5 * Math.sin(a * 5))})`; g.beginPath(); g.arc(cx + Math.cos(a) * (cr + wob), cy + Math.sin(a) * (cr + wob), 0.9 + r() * 0.7, 0, 7); g.fill(); }
    const st = g.createRadialGradient(cx, cy, cr * 0.2, cx, cy, cr); st.addColorStop(0, 'rgba(140,96,50,0.03)'); st.addColorStop(1, 'rgba(140,96,50,0.08)'); g.fillStyle = st; g.beginPath(); g.arc(cx, cy, cr, 0, 7); g.fill();
  }
  grain(g, w, h, 14, seed, 3);
  const e = o.edge ?? 3, eg = g.createLinearGradient(0, 0, 0, h);
  g.strokeStyle = 'rgba(110,90,55,0.35)'; g.lineWidth = e; g.strokeRect(e / 2, e / 2, w - e, h - e); void eg;
  if (o.tape) for (const [x, y, a] of [[10, 4, -0.5], [w - 10, 4, 0.5]] as [number, number, number][]) { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = 'rgba(230,220,180,0.62)'; g.fillRect(-12, -5, 24, 10); g.strokeStyle = 'rgba(150,130,90,0.4)'; g.lineWidth = 0.5; g.strokeRect(-12, -5, 24, 10); g.restore(); }
  return url(c);
}
/** olive-drab (or other) enamel on steel: orange peel, lamp light from above, chips worn to bare steel at the edges */
export function enamel(w: number, h: number, o: { color?: string; seed?: number; screws?: boolean; chips?: number } = {}) {
  const { c, g } = canvas(w, h), seed = o.seed ?? 3, r = rnd(seed);
  g.fillStyle = o.color ?? PAL.olive; g.fillRect(0, 0, w, h);
  const lg = g.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, 'rgba(255,245,220,0.10)'); lg.addColorStop(0.5, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.18)'); g.fillStyle = lg; g.fillRect(0, 0, w, h);
  mottle(g, w, h, 'rgba(20,18,10,A)', 4, seed, 0.1);
  grain(g, w, h, 9, seed);
  // chips: where the edges get knocked; each a little island of bare steel with a dark rim
  const chips = o.chips ?? Math.round((w + h) / 60);
  for (let i = 0; i < chips; i++) {
    const side = Math.floor(r() * 4), t = r(), x = side === 0 ? t * w : side === 1 ? w - r() * 4 : side === 2 ? t * w : r() * 4, y = side === 0 ? r() * 4 : side === 1 ? t * h : side === 2 ? h - r() * 4 : t * h, rr = 1.2 + r() * 3.2;
    g.beginPath(); for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2, q = rr * (0.6 + r() * 0.6); k ? g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q * 0.7) : g.moveTo(x + q, y); } g.closePath();
    g.fillStyle = 'rgba(25,24,18,0.55)'; g.fill(); g.save(); g.translate(-0.5, -0.5); g.fillStyle = PAL.steel; g.fill(); g.restore();
  }
  // a few scratches where things slide across it
  g.lineWidth = 0.5; for (let i = 0; i < 3; i++) { const x = r() * w, y = r() * h, l = 10 + r() * 30, a = -0.3 + r() * 0.6; g.strokeStyle = 'rgba(200,200,190,0.18)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  g.strokeStyle = 'rgba(255,250,230,0.16)'; g.lineWidth = 1; g.beginPath(); g.moveTo(1, h - 1); g.lineTo(1, 1); g.lineTo(w - 1, 1); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.moveTo(w - 0.5, 1); g.lineTo(w - 0.5, h - 0.5); g.lineTo(1, h - 0.5); g.stroke();
  if (o.screws !== false) for (const [x, y] of [[5, 5], [w - 5, 5], [5, h - 5], [w - 5, h - 5]]) screw(g, x, y, r() * 3);
  return url(c);
}
function screw(g: G, x: number, y: number, a: number) {
  const sg = g.createRadialGradient(x - 0.8, y - 0.8, 0.2, x, y, 2.6); sg.addColorStop(0, '#c4c6c0'); sg.addColorStop(1, '#5a5c58');
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.arc(x + 0.4, y + 0.5, 2.6, 0, 7); g.fill();
  g.fillStyle = sg; g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill();
  g.strokeStyle = 'rgba(30,30,28,0.8)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x - Math.cos(a) * 1.8, y - Math.sin(a) * 1.8); g.lineTo(x + Math.cos(a) * 1.8, y + Math.sin(a) * 1.8); g.stroke();
}
/** a masonite clipboard with rounded corners and a hanging hole */
export function board(w: number, h: number, seed = 11) {
  const { c, g } = canvas(w, h);
  g.beginPath(); g.roundRect(0.5, 0.5, w - 1, h - 1, 7); g.fillStyle = PAL.masonite; g.fill(); g.save(); g.clip();
  mottle(g, w, h, 'rgba(30,18,8,A)', 6, seed, 0.12);
  grain(g, w, h, 12, seed, 6);
  g.restore();
  g.strokeStyle = 'rgba(255,230,190,0.18)'; g.lineWidth = 1; g.beginPath(); g.roundRect(1, 1, w - 2, h - 2, 6.5); g.stroke();
  g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.ellipse(w / 2, 7, 6, 3.5, 0, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
  return url(c);
}
/** a cyanotype sheet: Prussian blue, white-ink grid, a title block */
export function blueprint(w: number, h: number, seed = 5) {
  const { c, g } = canvas(w, h);
  g.fillStyle = PAL.prussian; g.fillRect(0, 0, w, h);
  mottle(g, w, h, 'rgba(10,25,45,A)', 5, seed, 0.25); mottle(g, w, h, 'rgba(90,130,170,A)', 3, seed + 3, 0.08);
  g.lineWidth = 0.5;
  for (let x = 4; x < w; x += 8) { g.strokeStyle = (x - 4) % 40 ? 'rgba(80,120,160,0.22)' : 'rgba(110,150,190,0.4)'; g.beginPath(); g.moveTo(x + 0.25, 0); g.lineTo(x + 0.25, h); g.stroke(); }
  for (let y = 4; y < h; y += 8) { g.strokeStyle = (y - 4) % 40 ? 'rgba(80,120,160,0.22)' : 'rgba(110,150,190,0.4)'; g.beginPath(); g.moveTo(0, y + 0.25); g.lineTo(w, y + 0.25); g.stroke(); }
  g.strokeStyle = 'rgba(232,238,240,0.7)'; g.lineWidth = 1; g.strokeRect(3.5, 3.5, w - 7, h - 7);
  grain(g, w, h, 10, seed);
  return url(c);
}
export interface CardCut { x: number; y: number; w: number; h: number }
/**
 * A McBee edge-notched card: a row of punched holes along the top, the notch over the hole for the gene's category
 * opened out to the edge (how a card sorter would pick it), a window cut for the specimen, red and blue index rules.
 */
export function notchCard(W0: number, H0: number, win0: CardCut, notch: number, seed = 1, u = 1) {
  const { c, g } = canvas(W0, H0), r = rnd(seed);
  // drawn in card units (u screen px each) so the punch pitch keeps its proportion at every UI scale
  g.scale(u, u);
  const w = W0 / u, h = H0 / u, win = { x: win0.x / u, y: win0.y / u, w: win0.w / u, h: win0.h / u };
  g.beginPath(); g.moveTo(0, 0); g.lineTo(w - 7, 0); g.lineTo(w, 7); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); // a clipped corner, the way index cards are cut
  g.fillStyle = '#ddd5c0'; g.fill();
  g.save(); g.clip();
  mottle(g, w, h, 'rgba(150,130,90,A)', 3, seed, 0.07);
  const ly = win.y + win.h;
  g.lineWidth = 0.6; g.strokeStyle = 'rgba(184,56,46,0.55)'; g.beginPath(); g.moveTo(0, ly + 16.5); g.lineTo(w, ly + 16.5); g.stroke();
  g.strokeStyle = 'rgba(122,150,170,0.5)'; for (let y = ly + 28.5; y < h - 3; y += 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  grain(g, w, h, 12, seed, 2);
  // the window: a die-cut edge shadow, then the hole
  g.strokeStyle = 'rgba(60,50,35,0.55)'; g.lineWidth = 1.4; g.strokeRect(win.x - 0.7, win.y - 0.7, win.w + 1.4, win.h + 1.4);
  g.strokeStyle = 'rgba(255,250,235,0.5)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(win.x - 1.5, win.y + win.h + 1.2); g.lineTo(win.x + win.w + 1.2, win.y + win.h + 1.2); g.lineTo(win.x + win.w + 1.2, win.y - 1.5); g.stroke();
  // edge wear on the top corners, a thumb smudge near the bottom
  const sm = g.createRadialGradient(w * 0.2, h - 8, 1, w * 0.2, h - 8, 14); sm.addColorStop(0, 'rgba(90,80,60,0.08)'); sm.addColorStop(1, 'rgba(90,80,60,0)'); g.fillStyle = sm; g.fillRect(0, 0, w, h);
  g.restore();
  g.globalCompositeOperation = 'destination-out';
  g.fillRect(win.x, win.y, win.w, win.h);
  const n = Math.floor((w - 12) / 9);
  for (let i = 0; i < n; i++) { const x = 10 + i * 9; g.beginPath(); g.arc(x, 5.5, 2.1, 0, 7); g.fill(); if (i === notch) g.fillRect(x - 2.1, 0, 4.2, 5.5); }
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(80,70,50,0.35)'; g.lineWidth = 0.5;
  for (let i = 0; i < n; i++) { const x = 10 + i * 9; g.beginPath(); g.arc(x, 5.5, 2.4, 0.3, Math.PI - 0.3); g.stroke(); }
  void r;
  return url(c);
}
/** the stamp-ink mask: mostly solid, with the dry speckle and starved edges of a real rubber stamp */
let INK: string | null = null;
export function inkMask() {
  if (INK) return INK;
  const S = 96, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!, img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = (hashi(x, y, 3) & 255) / 255, m = (hashi(x >> 2, y >> 2, 5) & 255) / 255, l = (hashi(x >> 4, (y >> 3) + 7, 9) & 255) / 255;
    const a = n * 0.35 + m * 0.4 + l * 0.25 > 0.3 ? 255 : n > 0.6 ? 150 : 30;
    const i = (y * S + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = a;
  }
  g.putImageData(img, 0, 0);
  return (INK = `url(${c.toDataURL()})`);
}
/** paint an element's background with a painter, repainting when it resizes */
const RO = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((es) => { for (const e of es) (e.target as HTMLElement & { __paint?: () => void }).__paint?.(); }) : null;
export function paintEl(el: HTMLElement, fn: (w: number, h: number) => string) {
  let last = '';
  const go = () => { const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight); if (w < 4 || h < 4) return; const key = w + 'x' + h; if (key === last) return; last = key; el.style.backgroundImage = fn(w, h); el.style.backgroundSize = '100% 100%'; };
  (el as HTMLElement & { __paint?: () => void }).__paint = go;
  RO?.observe(el); requestAnimationFrame(go);
  return go;
}
export function unpaint(el: HTMLElement) { RO?.unobserve(el); }

// ------------------------------------------------------------------------------------------------ type, pencil, motion
export const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const typing = new WeakMap<HTMLElement, number>();
/** type a value into a field, a character at a time, with a caret (instant when it has not changed or motion is off) */
export function type(el: HTMLElement, text: string, cps = 55, delay = 0) {
  if (el.dataset.t === text) return;
  const first = el.dataset.t === undefined;
  el.dataset.t = text;
  const prev = typing.get(el); if (prev) clearInterval(prev);
  if (reduced() || (first && delay < 0)) { el.textContent = text; return; }
  let i = 0; el.textContent = '';
  const caret = document.createElement('i'); caret.className = 'lb-caret';
  const start = performance.now() + delay;
  const id = window.setInterval(() => {
    const n = Math.floor(((performance.now() - start) / 1000) * cps);
    if (n < 0) return;
    if (n > i) { i = Math.min(text.length, n); el.textContent = text.slice(0, i); el.appendChild(caret); }
    if (i >= text.length) { clearInterval(id); typing.delete(el); caret.remove(); el.textContent = text; }
  }, 16);
  typing.set(el, id);
}
/** hand-lettered pencil: each letter sits a little off the baseline and leans its own way */
export function pencil(text: string, seed = 1) {
  let s = '';
  [...text].forEach((ch, i) => {
    if (ch === ' ') { s += ' '; return; }
    const h = hashi(i, seed, 13), r = ((h & 255) / 255 - 0.5) * 7, y = (((h >> 8) & 255) / 255 - 0.5) * 1.6;
    s += `<b style="transform:translateY(${y.toFixed(2)}px) rotate(${r.toFixed(1)}deg)">${ch === '<' ? '&lt;' : ch === '&' ? '&amp;' : ch}</b>`;
  });
  return s;
}
