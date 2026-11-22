// Shared pieces for the SHIP and LAB screens (v7): every element is a designed object painted with the UI kit at one
// art pixel = 2 screen px (materials from the MATERIAL LIBRARY through the kit's plates), Alagard text through the kit
// classes, recorded CC0 sounds and the kit's juice on every interaction.
//   keyCap(host, { label, icon, mat, onClick })   a physical push key: a chamfered cap in a sunk well, presses in
//   chip(icon, text, o)                           an icon and a number on a small enamel tag
//   reqChips(game, feature)                       what a locked function needs, as chips (knowledge, items, a face)
//   iconOf(name, pal) / itemImg(id, px)           icon canvases
import { plate, skin, type Mat } from '../../ui/kit/mat';
import { Px, P, INK, bevel, hex, rivet, mixHex } from '../../ui/kit/px';
import { bitText, bitMeasure } from '../../ui/kit/bitfont';
import { uiSfx, type UiSfx } from '../../ui/kit/sound';
import { squash, pop, shake } from '../../ui/kit/juice';
import { installKitStyle } from '../../ui/kit/style';
import { iconCanvas, type PalKey } from '../../research/ui/icons';
import { stepIcon, DATA_ICON } from '../../story/icons';
import { portrait } from '../../social/portrait';
import { PEOPLE } from '../../social/social';
import { NODE } from '../../research/unlocks';
import { QUEST } from '../../story/questData';
import { itemIcon } from '../../factory/items';
import type { Req } from '../../research/progress';

export const S = 2;
let css = false;
export function shipCSS() {
  installKitStyle();
  if (css) return; css = true;
  const s = document.createElement('style'); s.id = 's7-css';
  s.textContent = `
.s7 { position: fixed; inset: 0; z-index: 760; user-select: none; -webkit-user-select: none; }
.s7 canvas { image-rendering: pixelated; display: block; }
.s7-veil { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 45%, rgba(8,9,12,.55), rgba(8,9,12,.92)); }
.s7-frame { position: absolute; }
.s7-frame > * { position: absolute; }
.s7-abs { position: absolute; }
.s7-mini { cursor: grab; touch-action: none; }
.s7-mini.drag { cursor: grabbing; }
.s7-ov { pointer-events: none; }
.s7-pin { position: absolute; pointer-events: none; transform: translate(-50%, -100%); transition: transform .22s cubic-bezier(.2,.9,.3,1.4), opacity .2s; }
.s7-pin.hot { transform: translate(-50%, -100%) translateY(-8px) scale(1.06); }
.s7-pin .k7-name { margin-top: -2px; text-align: center; }
.s7-tag { position: absolute; pointer-events: none; transform: translate(-50%, 0); transition: opacity .16s, transform .2s cubic-bezier(.2,.9,.3,1.4); }
.s7-tag.off { opacity: 0; transform: translate(-50%, 10px); }
.s7-key { position: relative; display: inline-block; cursor: pointer; transition: transform .07s, filter .15s; }
.s7-key:hover { filter: brightness(1.12); }
.s7-key.down { transform: translateY(3px); }
.s7-key.off { cursor: default; filter: saturate(.4) brightness(.7); }
.s7-key canvas { position: absolute; left: 0; top: 0; }
.s7-chip { display: inline-flex; align-items: center; gap: 2px; position: relative; }
.s7-chip canvas, .s7-chip img { image-rendering: pixelated; display: block; }
.s7-bay { overflow: hidden; }
.s7-panel { position: absolute; inset: 0; }
.s7-panel > * { position: absolute; }
.s7-card { cursor: pointer; transition: transform .2s cubic-bezier(.2,.9,.3,1.4), filter .15s; }
.s7-card:hover { transform: translateY(-6px) rotate(-1deg); filter: brightness(1.1); }
.s7-card.dead { filter: grayscale(.9) brightness(.7); cursor: default; }
.s7-card.dead:hover { transform: none; }
.s7-tab { cursor: pointer; transition: transform .18s cubic-bezier(.2,.9,.3,1.4), filter .15s; }
.s7-tab:hover { transform: translateY(-3px); filter: brightness(1.15); }
.s7-tab.on { transform: translateY(4px); }
.s7-hit { position: absolute; cursor: pointer; }
`;
  document.head.append(s);
}

export const div = (cls: string, parent?: HTMLElement) => { const e = document.createElement('div'); e.className = cls; parent?.append(e); return e; };
/** absolutely place an element at art px */
export function place(el: HTMLElement, x: number, y: number, w?: number, h?: number) {
  el.style.left = x * S + 'px'; el.style.top = y * S + 'px';
  if (w !== undefined) el.style.width = w * S + 'px';
  if (h !== undefined) el.style.height = h * S + 'px';
  return el;
}
/** a canvas at art resolution shown at S */
export function artCanvas(w: number, h: number, cls = 's7-abs'): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.className = cls;
  c.style.width = w * S + 'px'; c.style.height = h * S + 'px';
  const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
  return c;
}
export const clean = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '');

const icons = new Map<string, HTMLCanvasElement>();
export function iconOf(name: string, pal: PalKey = 'amber'): HTMLCanvasElement { const k = name + pal; let c = icons.get(k); if (!c) { c = iconCanvas(name, pal); icons.set(k, c); } return c; }
const imgs = new Map<string, HTMLImageElement>();
export function itemImg(id: string, px = 32): HTMLImageElement {
  const k = id + px; let im = imgs.get(k);
  if (!im) { im = new Image(); try { im.src = itemIcon(id as never, px); } catch { /* unknown item */ } imgs.set(k, im); }
  return im;
}

// ------------------------------------------------------------------ the physical key
export interface KeyOpts { label?: string; icon?: HTMLCanvasElement | HTMLImageElement | null; w?: number; h?: number; mat?: 'orange' | 'steel' | 'enamel' | 'olive' | 'red' | 'brass'; sound?: UiSfx; onClick?: () => void; off?: () => boolean | string }
export interface Key { el: HTMLDivElement; set(o: Partial<KeyOpts>): void; refresh(): void; flash(): void }
const KEY_RAMP = { orange: P.rust, steel: P.steel, enamel: P.bone, olive: P.olive, red: P.ruby, brass: P.brass };
export function keyCap(host: HTMLElement, o: KeyOpts): Key {
  const el = div('s7-key', host);
  const W = o.w ?? 96, H = o.h ?? 30;
  el.style.width = W * S + 'px'; el.style.height = H * S + 'px';
  const cv = artCanvas(W, H, ''); el.append(cv);
  let down = false, lit = 0;
  const paint = () => {
    const off = o.off?.() ?? false;
    const p = new Px(W, H);
    p.rect(0, 3, W, H - 3, INK);
    bevel(p, 1, 4, W - 2, H - 5, P.steel, { chamfer: 3, sunk: true });
    const ramp = off ? P.stone : KEY_RAMP[o.mat ?? 'orange'];
    const dy = down ? 3 : 0;
    bevel(p, 3, 1 + dy, W - 6, H - 8, ramp, { chamfer: 3 });
    if (!off && !down) for (let x = 6; x < W - 6; x += 1) if ((x * 7) % 5 < 3) p.set(x, 3 + dy, mixHex(ramp[5] ?? ramp[ramp.length - 1], 0xffffff, 0.35 + lit * 0.4));
    if (W > 60) { rivet(p, 7, Math.round(H / 2) - 3 + dy, 1, P.steel); rivet(p, W - 8, Math.round(H / 2) - 3 + dy, 1, P.steel); }
    const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false;
    c.putImageData(p.image(), 0, 0);
    let x = W / 2, tw = o.label ? bitMeasure(o.label) : 0;
    const iw = o.icon ? 20 : 0, gap = o.icon && o.label ? 3 : 0, total = iw + gap + tw;
    x = Math.round(W / 2 - total / 2);
    if (o.icon) { c.drawImage(o.icon, x, Math.round((H - 8) / 2 - 9) + 1 + dy, 20, 20); x += iw + gap; }
    if (o.label) bitText(c, o.label, x, Math.round((H - 8) / 2 - 7) + 1 + dy, { color: off ? '#b8b4a8' : o.mat === 'enamel' || o.mat === 'steel' ? hex(P.ink[1]) : '#fff2d8', outline: o.mat === 'enamel' || o.mat === 'steel' ? null : hex(INK), extrude: o.mat === 'enamel' || o.mat === 'steel' ? undefined : [1, '#3a1a0a'] });
    el.classList.toggle('off', !!off);
    if (typeof off === 'string') el.title = off; else el.removeAttribute('title');
  };
  el.addEventListener('pointerdown', (e) => { if (e.button > 0) return; e.stopPropagation(); if (o.off?.()) return; down = true; el.classList.add('down'); paint(); uiSfx('tick', 0.5, 0.8); });
  const up = () => { if (!down) return; down = false; el.classList.remove('down'); paint(); };
  el.addEventListener('pointerleave', up);
  el.addEventListener('pointerenter', () => { if (!o.off?.()) uiSfx('hover', 0.4); });
  el.addEventListener('click', (e) => {
    e.stopPropagation(); up();
    const off = o.off?.();
    if (off) { uiSfx('error', 0.5); shake(el, 4); return; }
    uiSfx(o.sound ?? 'click', 0.7); squash(el, 0.6);
    o.onClick?.();
  });
  paint();
  return {
    el, refresh: paint,
    set(n) { Object.assign(o, n); paint(); },
    flash() { lit = 1; paint(); pop(el, 0.6); setTimeout(() => { lit = 0; paint(); }, 260); },
  };
}

// ------------------------------------------------------------------ chips
/** an icon and a short number on a small enamel tag; red when short */
export function chip(icon: CanvasImageSource | null, text: string, o: { ok?: boolean; mat?: Mat; iconPx?: number; w?: number } = {}): HTMLDivElement {
  const el = div('s7-chip');
  const ip = o.iconPx ?? 16, tw = text ? bitMeasure(text) : 0, W = o.w ?? Math.max(24, ip + (text ? tw + 9 : 6)), H = Math.max(20, ip + 4);
  const cv = artCanvas(W, H, '');
  const c = cv.getContext('2d')!;
  const p = plate(W, H, { mat: o.mat ?? 'enamel', seed: W + H, chamfer: 2, wear: 0.4, lip: 1, grime: 0.2 });
  c.putImageData(p.image(), 0, 0);
  const draw = () => {
    if (icon && (!(icon instanceof HTMLImageElement) || icon.complete)) c.drawImage(icon, 3, Math.round((H - ip) / 2), ip, ip);
  };
  draw(); if (icon instanceof HTMLImageElement && !icon.complete) icon.addEventListener('load', draw, { once: true });
  if (text) bitText(c, text, ip + 5, Math.round(H / 2 - 7), { color: o.ok === false ? hex(P.ruby[2]) : hex(P.ink[1]), outline: null });
  el.append(cv);
  return el;
}

/** the requirement chips of the node that grants a feature (knowledge, items, a quest, the bond with a face) */
export function reqChips(game: any, feature: string): HTMLDivElement[] {
  const U = game?.unlocks; if (!U) return [];
  const n = U.nodeFor?.(feature); if (!n) return [];
  const reqs: Req[] = U.reqs(n.id);
  const out: HTMLDivElement[] = [];
  for (const r of reqs) {
    if (r.ok && r.k !== 'close') continue;
    if (r.k === 'know') out.push(chip(stepIcon(DATA_ICON[r.kind]), `${r.have}/${r.need}`, { ok: r.ok }));
    else if (r.k === 'item') out.push(chip(itemImg(r.id, 32), `${r.have}/${r.need}`, { ok: r.ok }));
    else if (r.k === 'close') out.push(bondChip(r.npc, r.have, r.need));
    else if (r.k === 'quest') { const q = (QUEST as Record<string, { icon?: string; giver?: string } | undefined>)[r.id]; out.push(chip(stepIcon(q?.icon ?? 'lens', q?.giver), `${r.n}/${r.of}`, { ok: r.ok })); }
    else if (r.k === 'need') out.push(chip(iconOf(NODE[r.id]?.icon ?? 'gear', 'steel'), '', { ok: r.ok }));
  }
  return out;
}
/** a person's face and their bond pips (filled to what you have, the needed ones marked) */
export function bondChip(npc: string, have: number, need: number): HTMLDivElement {
  const el = div('s7-chip');
  const W = 22 + 5 * 6 + 6, H = 22;
  const cv = artCanvas(W, H, ''); const c = cv.getContext('2d')!;
  c.putImageData(plate(W, H, { mat: 'enamel', seed: 3, chamfer: 2, wear: 0.3, lip: 1, grime: 0.2 }).image(), 0, 0);
  const f = portrait(npc);
  if (f) c.drawImage(f, 2, 2, 18, 18);
  else { c.fillStyle = PEOPLE[npc]?.col ?? '#c8a060'; c.fillRect(4, 4, 14, 14); }
  for (let i = 0; i < 5; i++) {
    const x = 23 + i * 6, on = i < have, nd = i < need;
    c.fillStyle = '#08090c'; c.fillRect(x - 1, 7, 6, 8);
    c.fillStyle = on ? '#ffc040' : nd ? '#7a3a1a' : '#4a4a44'; c.fillRect(x, 8, 4, 6);
    if (on) { c.fillStyle = '#fff0b0'; c.fillRect(x, 8, 2, 1); }
  }
  el.append(cv);
  return el;
}
/** a row of chips laid out on an enamel strip (the hanging requirement tag) */
export function chipRow(host: HTMLElement, chips: HTMLElement[], gap = 2) {
  host.style.display = 'flex'; host.style.gap = gap * S + 'px'; host.style.alignItems = 'center'; host.style.flexWrap = 'wrap';
  host.replaceChildren(...chips);
}
/** paint a block as a plate of a material (repainted to its size) */
export function plateEl(el: HTMLElement, mat: Mat, seed = 1, o: Partial<Parameters<typeof plate>[2]> = {}) {
  skin(el, (w, h) => plate(w, h, { mat, seed, chamfer: 4, wear: 0.7, screws: true, ...o }), S);
  return el;
}
/** a small padlock sprite (art px), steel shackle over a brass body */
export function padlock(sc = 1): HTMLCanvasElement {
  const p = new Px(14, 16);
  for (let y = 0; y < 7; y++) for (let x = 0; x < 14; x++) { const d = Math.hypot(x - 6.5, y - 6.5); if (d >= 3.2 && d <= 5.4 && y < 7) p.set(x, y, d < 4 ? P.steel[5] : P.steel[3]); }
  bevel(p, 1, 6, 12, 10, P.brass, { chamfer: 1 });
  p.rect(6, 9, 2, 4, INK); p.set(6, 9, P.brass[1]);
  p.outline(INK);
  const c = p.canvas(); c.style.width = 14 * S * sc + 'px'; c.style.height = 16 * S * sc + 'px';
  return c;
}

/** a whole-pixel line on a canvas (Bresenham, 1 art px), so traces stay crisp at 2x */
export function pxLine(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, col: string, w = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, o = Math.floor(w / 2);
  let e = dx + dy; c.fillStyle = col;
  for (let n = 0; n < 4096; n++) { c.fillRect(x0 - o, y0 - o, w, w); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
}
export function pxPoly(c: CanvasRenderingContext2D, pts: [number, number][], col: string, w = 1) { for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; pxLine(c, a[0], a[1], b[0], b[1], col, w); } }
const rings = new Map<string, HTMLCanvasElement>();
/** a socket ring sprite: ink, a metal rim lit from the upper left, a dark well (whole pixels) */
export function ringSprite(R: number, rim: readonly number[], well = 0x14181c): HTMLCanvasElement {
  const k = R + ':' + rim[3] + ':' + well; let c = rings.get(k); if (c) return c;
  const s = R * 2 + 6, p = new Px(s, s), m = s / 2;
  p.disc(m, m, R + 2.5, () => INK);
  p.disc(m, m, R + 1.5, (_d, lit) => rim[Math.max(0, Math.min(rim.length - 1, Math.round(3 + lit * 2)))]);
  p.disc(m, m, R - 0.5, () => INK);
  p.disc(m, m, R - 1.5, (_d, lit) => mixHex(well, 0x000000, 0.2 - lit * 0.2));
  c = p.canvas(); rings.set(k, c); return c;
}
