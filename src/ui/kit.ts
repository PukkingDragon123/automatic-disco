// DOM widgets over the pixel art: panels, buttons, bars, tooltips, toasts. Everything scales by an integer --s.
// The skin is the golem's own machinery (see machine.ts): riveted housings, Bakelite keys, phosphor CRTs.
import { icon } from './pixelart';
import { installTheme, cursorURL, segBarURL } from './machine';
import { sfx } from '../audio/audio';

export let S = 2;
export function setupUI() {
  S = innerHeight >= 1040 ? 3 : 2;
  const r = document.documentElement.style;
  r.setProperty('--s', String(S));
  installTheme(r);
  r.setProperty('--cur-point', `url(${cursorURL('point')}) 2 2, auto`);
  r.setProperty('--cur-attack', `url(${cursorURL('attack')}) 16 14, crosshair`);
  r.setProperty('--cur-target', `url(${cursorURL('target')}) 16 16, crosshair`);
  r.setProperty('--cur-build', `url(${cursorURL('build')}) 14 14, crosshair`);
  addEventListener('resize', () => { const n = innerHeight >= 1040 ? 3 : 2; if (n !== S) { S = n; r.setProperty('--s', String(S)); } });
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement | null, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}
export const ui = () => document.getElementById('ui') as HTMLElement;

export function panel(cls = '', parent: HTMLElement | null = ui(), kind: 'panel' | 'inset' | 'dark' = 'panel') {
  return el('div', `px-${kind} ${cls}`, parent);
}

export interface BtnOpts { icon?: string; label?: string; hotkey?: string; cost?: string; tip?: () => string; disabled?: () => boolean | string; active?: () => boolean; size?: 'sq' | 'wide' | 'big'; cls?: string; sound?: boolean }
export class Btn {
  readonly e: HTMLButtonElement;
  private img: HTMLImageElement | null = null;
  private iconName = ''; private dimmed = false;
  constructor(parent: HTMLElement, public o: BtnOpts, public onClick: () => void) {
    const e = (this.e = el('button', `px-btn ${o.size ?? 'sq'} ${o.cls ?? ''}`, parent));
    if (o.icon) { this.img = el('img', 'ico', e); this.setIcon(o.icon); }
    if (o.label) el('span', 'lbl', e, o.label);
    if (o.hotkey) el('span', 'hk', e, o.hotkey);
    if (o.cost) el('span', 'cost', e, o.cost);
    e.addEventListener('click', (ev) => { ev.stopPropagation(); if (this.isDisabled()) { sfx('deny'); return; } if (o.sound !== false) sfx('click'); this.onClick(); });
    e.addEventListener('pointerenter', () => { if (!this.isDisabled()) sfx('hover'); if (o.tip) Tip.show(this.tipHTML(), e); });
    e.addEventListener('pointerleave', () => Tip.hide());
    e.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  }
  setIcon(name: string) { this.iconName = name; if (this.img) this.img.src = icon(name, { dim: this.dimmed, shadow: true }); }
  isDisabled() { const d = this.o.disabled?.(); return !!d; }
  tipHTML() {
    let h = this.o.tip ? this.o.tip() : '';
    const d = this.o.disabled?.();
    if (typeof d === 'string' && d) h += `<div class="tip-warn">${d}</div>`;
    return h;
  }
  refresh() {
    const d = this.isDisabled();
    this.e.classList.toggle('dis', d);
    this.e.classList.toggle('act', !!this.o.active?.());
    if (this.img && d !== this.dimmed) { this.dimmed = d; this.setIcon(this.iconName); }
  }
}

export class Bar {
  readonly e: HTMLDivElement; private fill: HTMLDivElement; private txt: HTMLSpanElement | null;
  constructor(parent: HTMLElement, col: number, label = true) {
    this.e = el('div', 'px-bar', parent);
    this.fill = el('div', 'fill', this.e);
    this.fill.style.backgroundImage = `url(${segBarURL(col)})`;
    this.txt = label ? el('span', 'txt', this.e) : null;
  }
  set(v: number, text?: string) { this.fill.style.width = `${Math.max(0, Math.min(1, v)) * 100}%`; if (this.txt && text !== undefined) this.txt.textContent = text; }
}

export const Tip = {
  e: null as HTMLDivElement | null,
  show(html: string, anchor?: HTMLElement, x?: number, y?: number) {
    if (!html) return;
    if (!this.e) this.e = el('div', 'px-dark tip', document.body);
    const was = this.e.style.display === 'block';
    this.e.innerHTML = html;
    this.e.style.display = 'block';
    if (!was) { this.e.classList.remove('on'); void this.e.offsetWidth; this.e.classList.add('on'); }
    const r = anchor?.getBoundingClientRect();
    const tw = this.e.offsetWidth, th = this.e.offsetHeight;
    let left = r ? r.left + r.width / 2 - tw / 2 : (x ?? 0) + 18;
    let top = r ? r.top - th - 6 : (y ?? 0) + 18;
    left = Math.max(4, Math.min(innerWidth - tw - 4, left)); if (top < 4) top = r ? r.bottom + 6 : 4;
    top = Math.min(innerHeight - th - 4, top);
    this.e.style.left = left + 'px'; this.e.style.top = top + 'px';
  },
  hide() { if (this.e) this.e.style.display = 'none'; },
};

export function iconImg(name: string, cls = 'ico', parent?: HTMLElement) { const i = el('img', cls, parent); i.src = icon(name, { shadow: true }); return i; }

let toastBox: HTMLDivElement | null = null;
export function toast(html: string, kind: 'info' | 'warn' | 'good' | 'story' = 'info', ms = 3600) {
  if (!toastBox) toastBox = el('div', 'toasts', ui());
  const t = el('div', `px-dark toast ${kind}`, toastBox, html);
  if (kind === 'warn') sfx('deny');
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 500); }, ms);
  while (toastBox.children.length > 5) toastBox.firstChild?.remove();
}

export const fmt = (n: number) => (n >= 10000 ? (n / 1000).toFixed(0) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : Math.floor(n).toString());
export function costHTML(bio: number, min: number, charge = 0) {
  const p: string[] = [];
  if (bio) p.push(`<span class="c-bio"><img src="${icon('bio')}">${bio}</span>`);
  if (min) p.push(`<span class="c-min"><img src="${icon('min')}">${min}</span>`);
  if (charge) p.push(`<span class="c-chg"><img src="${icon('charge')}">${charge}</span>`);
  return p.join(' ');
}
