// UI KIT · PANELS (the standard detailed box for every agent): a DOM element in a 3D machine housing drawn by the
// kit's machine renderer (machine.ts, ported from Limbophobia's machine kit), one art pixel per CSS pixel. Library
// material faces worn by hand, a raised rail, corner guards, bolts and rivets, a printed NAMEPLATE in Alagard, lamps,
// vents, cable glands, a hazard foot, and the content sunk in a dark WELL behind a screwed lip (inner bevel). The DOM
// stays DOM: text, focus, scrolling and clicks work as usual; the housing repaints only when the element changes size.
//   const p = panel({ title: 'PARTS', tone: 'gun', lamps: ['green', 'amber'] });  p.body.append(...); parent.append(p.el)
//   p.lamp(i, on)  p.setTitle(t)  p.repaint()  p.dispose()
//   frame(el, spec => HousingSpec, { pad })     hang any housing on any element (the low-level hook)
//   slot(size, { n, tone, onClick })            an ITEM SLOT: a sunk cup with depth, a rubber bed, a number tag and a
//                                               lamp; .set({ icon, count, state }) (state 0 empty 1 filled 2 hot 3 picked 4 locked)
//   slotGrid(n, cols, size, o)                  a grid of slots in a sunk tray
//   meter(label, frac, o)                       a readout: a glass well with lit LED segments and a rolling number
//   pkey(label, fn, o)                          a push key in a bezel with a lamp (hardware keys on a panel: tabs, toggles)
// The standard look for everyone: panel() for boxes, slot() for anything an item sits in, meter() for numbers.
import { housing, shoot, disposeTree, sheet, socketPart, keyPart, keyLayout, KEY_Z, setLamp, mxOk, tinyText, tinyW, type HousingSpec, type Tone, type LampCol, type SlotState, type KeyState, type Rect } from './machine';
import { bitText, bitMeasure, bitReady } from './bitfont';
import { uiSfx, type UiSfx } from './sound';
import { Counter } from './juice';

// ------------------------------------------------------------------ the frame hook
export interface Frame { cv: HTMLCanvasElement; repaint(): void; dispose(): void; lamp(i: number, on: boolean): void; readonly size: { w: number; h: number } }
/** hang a 3D housing behind `el`; spec(w, h) gives the housing for the element's current size */
export function frame(el: HTMLElement, spec: (w: number, h: number) => HousingSpec, o: { pad?: number } = {}): Frame {
  installPanelCSS();
  const cv = document.createElement('canvas'); cv.className = 'kp-cv';
  const pad = o.pad ?? 12; el.classList.add('kp-f'); el.prepend(cv);
  let lastW = 0, lastH = 0, lampOn: boolean[] = [], built: { w: number; h: number; s: HousingSpec } | null = null;
  const size = { w: 0, h: 0 };
  const draw = () => {
    if (!built) return;
    const { w, h, s } = built, lamps = (s.lamps ?? []).map((l, i) => ({ ...l, on: lampOn[i] ?? l.on }));
    const H = housing({ ...s, lamps }), W2 = w + pad * 2, H2 = h + pad * 2;
    if (cv.width !== W2 || cv.height !== H2) { cv.width = W2; cv.height = H2; }
    const c = cv.getContext('2d')!; c.clearRect(0, 0, W2, H2);
    shoot(H.root, w, h, pad, c, 0, 0, { shadow: [3, 4], shadowA: 0.5 });
    disposeTree(H.root);
  };
  const repaint = (force = false) => {
    const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
    if (w < 12 || h < 12 || !el.isConnected) return;
    if (!force && w === lastW && h === lastH) return;
    lastW = w; lastH = h; size.w = w; size.h = h;
    cv.style.left = -pad + 'px'; cv.style.top = -pad + 'px'; cv.style.width = w + pad * 2 + 'px'; cv.style.height = h + pad * 2 + 'px';
    const s = spec(w, h); lampOn = (s.lamps ?? []).map((l, i) => lampOn[i] ?? !!l.on);
    built = { w, h, s }; draw();
  };
  let raf = 0;
  const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => repaint()); };
  let ro: ResizeObserver | null = null;
  try { ro = new ResizeObserver(later); ro.observe(el); } catch { /* old browser */ }
  requestAnimationFrame(() => repaint());
  void bitReady().then(() => repaint(true));
  return { cv, size, repaint: () => repaint(true), dispose: () => { ro?.disconnect(); cv.remove(); el.classList.remove('kp-f'); }, lamp: (i, on) => { if (lampOn[i] === on) return; lampOn[i] = on; draw(); } };
}

// ------------------------------------------------------------------ the stock panel
export interface PanelOpts {
  title?: string; tone?: Tone; seed?: number; cls?: string;
  /** the content well: 'back' a dark sunk recess behind a screwed lip (default), 'none' content straight on the face */
  well?: 'back' | 'none';
  lamps?: LampCol[]; hazard?: boolean; glands?: number; vents?: boolean; guards?: boolean; serial?: string; handles?: boolean;
  /** the hood (title band), foot and side margins round the well, px */
  head?: number; foot?: number; side?: number;
  /** decor on the foot */
  knobs?: number; toggles?: number;
  /** stencilled tiny words on the hood / foot */
  stencil?: string;
}
export interface Panel { el: HTMLDivElement; body: HTMLDivElement; frame: Frame | null; lamp(i: number, on: boolean): void; setTitle(t: string): void; repaint(): void; dispose(): void }
/** the housing for a stock panel of w x h */
export function panelSpec(w: number, h: number, o: PanelOpts = {}): HousingSpec {
  const seed = o.seed ?? 11, head = o.head ?? (o.title ? 34 : 14), foot = o.foot ?? 18, side = o.side ?? 10;
  const cut = Math.max(5, Math.min(12, Math.round(Math.min(w, h) * 0.06)));
  const s: HousingSpec = { w, h, seed, tone: o.tone ?? 'gun', depth: 9, cut, guards: o.guards ?? (w > 160 && h > 120), plates: [], lamps: [], vents: [], glands: [], hazards: [], stencils: [], knobs: [], toggles: [], wins: [], seamsY: [], handles: [] };
  if (o.well !== 'none') s.wins!.push({ x: side, y: head, w: w - side * 2, h: h - head - foot, back: true, cut: 5, lip: 4, lipTone: 'dark' });
  s.seamsY!.push(Math.max(6, head - 8));
  if (o.title && head >= 26) {
    const ph = 22, pw = Math.min(Math.max(64, bitMeasure(o.title) + 26), Math.round(w * 0.62));
    s.plates!.push({ x: cut + 14, y: Math.round((head - 8 - ph) / 2) + 1, w: pw, h: ph, text: o.title, ground: 'yellow' });
    if (o.serial && w > pw + 140) s.plates!.push({ x: cut + 22 + pw, y: Math.round((head - 8 - 13) / 2) + 2, w: tinyW(o.serial) + 10, h: 13, text: o.serial, ground: 'brass', tiny: true });
  }
  const lamps = o.lamps ?? ['green', 'amber'];
  if (head >= 20 && w > 120) lamps.forEach((c, i) => s.lamps!.push({ x: w - cut - 12 - i * 12, y: (head - 8) / 2 + 1, r: 3, col: c, on: i === 0 }));
  if (o.vents !== false && head >= 26 && w > 300) s.vents!.push({ x: Math.round(w * 0.6), y: Math.round((head - 8) * 0.3), w: Math.round(Math.min(70, w * 0.14)), h: Math.max(6, Math.round((head - 8) * 0.45)) });
  if (o.hazard !== false && foot >= 12 && w > 140) s.hazards!.push({ x: cut + 12, y: h - foot + 4, w: Math.min(120, Math.round(w * 0.26)), h: Math.min(9, foot - 7) });
  if (o.stencil && foot >= 12) s.stencils!.push({ text: o.stencil, x: w - cut - 16, y: h - foot / 2 + 2, align: 'right', tiny: true, color: 0xd8c060, alpha: 0.75 });
  for (let i = 0; i < (o.knobs ?? 0); i++) s.knobs!.push({ x: w - cut - 18 - i * 20, y: h - foot / 2, r: Math.min(5, foot * 0.26), a: (i * 1.7 + seed) % 3 - 1.5 });
  for (let i = 0; i < (o.toggles ?? 0); i++) s.toggles!.push({ x: Math.round(w * 0.5) + i * 14, y: h - foot / 2 - 1, on: (i + seed) % 3 !== 0 });
  const ng = o.glands ?? (w > 260 ? 2 : w > 120 ? 1 : 0), cab = [0x1a1a18, 0xc8a020, 0x2a3440, 0x7a1810];
  for (let i = 0; i < ng; i++) s.glands!.push({ x: Math.round(w * (0.62 + i * 0.16)), y: h - 4, col: cab[(i + seed) % cab.length], drop: 10 + ((seed + i * 7) % 9) });
  if (o.handles && h > 90) { s.handles!.push({ x: 4, y0: head + 10, y1: Math.min(h - foot - 10, head + 70) }); s.handles!.push({ x: w - 4, y0: head + 10, y1: Math.min(h - foot - 10, head + 70) }); }
  return s;
}
export function panel(o: PanelOpts = {}): Panel {
  installPanelCSS();
  const el = document.createElement('div'); el.className = 'kp' + (o.cls ? ' ' + o.cls : '');
  const head = o.head ?? (o.title ? 34 : 14), foot = o.foot ?? 18, side = o.side ?? 10;
  el.style.padding = `${head + 6}px ${side + 6}px ${foot + 6}px`;
  const body = document.createElement('div'); body.className = 'kp-body'; el.append(body);
  let title = o.title;
  const fr = mxOk() ? frame(el, (w, h) => panelSpec(w, h, { ...o, title })) : null;
  if (!fr) el.classList.add('kp-flat');
  return {
    el, body, frame: fr,
    lamp: (i, on) => fr?.lamp(i, on),
    setTitle: (t) => { if (t === title) return; title = t; fr?.repaint(); },
    repaint: () => fr?.repaint(),
    dispose: () => { fr?.dispose(); el.remove(); },
  };
}

// ------------------------------------------------------------------ item slots
export interface Slot { el: HTMLButtonElement; icon: HTMLDivElement; set(o: { icon?: HTMLCanvasElement | HTMLImageElement | null; count?: string | number | null; state?: SlotState; n?: string }): void; readonly state: SlotState }
const SPAD = 6;
const slotSheet = (S: number, tone: Tone) => sheet(`slot|${S}|${tone}`, S, S, SPAD, 5, (f) => socketPart(S, f as SlotState, { tone, n: ' ' }), { shadow: [2, 3], shadowA: 0.45 });
export function slot(S = 52, o: { n?: string; tone?: Tone; onClick?: (e: MouseEvent) => void; hover?: UiSfx | ''; title?: string } = {}): Slot {
  installPanelCSS();
  const el = document.createElement('button'); el.type = 'button'; el.className = 'kslot'; el.style.width = el.style.height = S + 'px';
  if (o.title) el.setAttribute('aria-label', o.title);
  const cv = document.createElement('canvas'); cv.className = 'kslot-cv'; cv.width = cv.height = S + SPAD * 2; cv.style.left = cv.style.top = -SPAD + 'px'; cv.style.width = cv.style.height = S + SPAD * 2 + 'px';
  const icon = document.createElement('div'); icon.className = 'kslot-ic';
  const lip = Math.max(5, Math.round(S * 0.12)); icon.style.inset = `${lip}px`;
  const cnt = document.createElement('span'); cnt.className = 'kslot-n k7-t16';
  el.append(cv, icon, cnt);
  let st: SlotState = 0, n = o.n ?? '';
  const draw = () => {
    const sh = slotSheet(S, o.tone ?? 'gun'), c = cv.getContext('2d')!; c.clearRect(0, 0, cv.width, cv.height);
    if (sh) c.drawImage(sh, 0, st * (S + SPAD * 2), S + SPAD * 2, S + SPAD * 2, 0, 0, S + SPAD * 2, S + SPAD * 2);
    if (n) tinyText(c, n, SPAD + 2 + Math.round((tinyW(n) + 6 - tinyW(n)) / 2), SPAD + 2 + 3, st === 3 ? '#1a1408' : '#e8c440', null);
    el.classList.toggle('picked', st === 3); el.classList.toggle('locked', st === 4); el.classList.toggle('hot', st === 2);
  };
  draw();
  el.addEventListener('pointerenter', () => { if (o.hover !== '') uiSfx(o.hover ?? 'hover', 0.3); });
  if (o.onClick) el.addEventListener('click', (e) => o.onClick!(e));
  const api: Slot = {
    el, icon, get state() { return st; },
    set(v) {
      if (v.icon !== undefined) { icon.textContent = ''; if (v.icon) { v.icon.classList.add('kslot-img'); icon.append(v.icon); } }
      if (v.count !== undefined) cnt.textContent = v.count === null || v.count === '' ? '' : String(v.count);
      if (v.n !== undefined) n = v.n;
      if (v.state !== undefined && v.state !== st) st = v.state;
      draw();
    },
  };
  return api;
}
/** a grid of slots in a sunk tray (the tray is just the panel's well; this lays them out) */
export function slotGrid(n: number, cols: number, S = 52, o: { gap?: number; tone?: Tone; numbered?: boolean; onClick?: (i: number, e: MouseEvent) => void } = {}): { el: HTMLDivElement; slots: Slot[] } {
  const el = document.createElement('div'); el.className = 'kslot-grid';
  el.style.gridTemplateColumns = `repeat(${cols}, ${S}px)`; el.style.gap = (o.gap ?? 6) + 'px';
  const slots: Slot[] = [];
  for (let i = 0; i < n; i++) { const s = slot(S, { n: o.numbered ? String(i + 1) : '', tone: o.tone, onClick: o.onClick ? (e) => o.onClick!(i, e) : undefined }); slots.push(s); el.append(s.el); }
  return { el, slots };
}

// ------------------------------------------------------------------ readouts: a glass well with LED segments and a number
export interface Meter { el: HTMLDivElement; set(frac: number, value?: number | string): void }
export function meter(label: string, frac: number, o: { w?: number; segs?: number; col?: 'amber' | 'teal' | 'green' | 'red' | 'white'; value?: number | string; unit?: string; neg?: boolean } = {}): Meter {
  installPanelCSS();
  const W = o.w ?? 150, H = 22, segs = o.segs ?? 12;
  const el = document.createElement('div'); el.className = 'kmeter';
  const lab = document.createElement('span'); lab.className = 'kmeter-l k7-t16'; lab.textContent = label;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.className = 'kmeter-cv';
  const num = document.createElement('span'); num.className = 'kmeter-v k7-t16';
  const counter = typeof o.value === 'number' ? new Counter(num, { size: 16 }) : null;
  if (counter) counter.set(o.value as number, true);
  if (!counter && o.value !== undefined) num.textContent = String(o.value);
  el.append(lab, cv, num);
  const COL = { amber: [0xffb02a, 0x5a3a08], teal: [0x40f0e0, 0x0a3a3a], green: [0x5cff7a, 0x0e3a18], red: [0xff5a3a, 0x3a0e08], white: [0xf0f0e0, 0x30302a] }[o.col ?? 'amber'];
  const hx = (c: number) => '#' + c.toString(16).padStart(6, '0');
  let cur = -1;
  const paint = (f: number) => {
    const c = cv.getContext('2d')!; c.clearRect(0, 0, W, H);
    // the well: a black recess, a lit lower lip, a dark upper lip (an inner bevel), glass glare
    c.fillStyle = '#060708'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#2c3238'; c.fillRect(0, H - 1, W, 1); c.fillRect(W - 1, 0, 1, H);
    c.fillStyle = '#000'; c.fillRect(0, 0, W, 1); c.fillRect(0, 0, 1, H);
    const gw = (W - 6 - (segs - 1) * 2) / segs, lit = Math.round(Math.max(0, Math.min(1, f)) * segs);
    for (let i = 0; i < segs; i++) {
      const x = Math.round(3 + i * (gw + 2)), on = i < lit;
      c.fillStyle = hx(on ? COL[0] : COL[1]); c.fillRect(x, 4, Math.max(1, Math.round(gw)), H - 8);
      if (on) { c.fillStyle = 'rgba(255,255,240,0.55)'; c.fillRect(x, 4, Math.max(1, Math.round(gw)), 2); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, H - 6, Math.max(1, Math.round(gw)), 2); }
    }
    c.fillStyle = 'rgba(190,220,255,0.10)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(W * 0.45, 0); c.lineTo(W * 0.3, H); c.lineTo(0, H); c.fill();
  };
  paint(frac); cur = frac;
  return { el, set(f, v) { if (f !== cur) { paint(f); cur = f; } if (v !== undefined) { if (counter && typeof v === 'number') counter.set(v); else num.textContent = String(v) + (o.unit ?? ''); } } };
}

// ------------------------------------------------------------------ push keys (hardware keys on a panel)
const KPAD = 5;
export interface PKey extends HTMLButtonElement { setOn(on: boolean): void; setDisabled(d: boolean): void }
export function pkey(label: string, fn: () => void, o: { w?: number; h?: number; tone?: Tone; lamp?: LampCol | false; hazard?: boolean; sound?: UiSfx; icon?: HTMLCanvasElement } = {}): PKey {
  installPanelCSS();
  const w = o.w ?? Math.max(70, bitMeasure(label) + 40 + (o.icon ? 26 : 0)), h = o.h ?? 34;
  const spec = { w, h, tone: o.tone ?? 'cream', lamp: o.lamp === undefined ? 'amber' as LampCol : o.lamp, hazard: o.hazard, seed: label.length * 7 };
  const b = document.createElement('button') as PKey; b.type = 'button'; b.className = 'kkey'; b.style.width = w + 'px'; b.style.height = h + 'px';
  const cv = document.createElement('canvas'); cv.className = 'kkey-cv'; cv.width = w + KPAD * 2; cv.height = h + KPAD * 2; cv.style.left = cv.style.top = -KPAD + 'px';
  const L = keyLayout(spec);
  const leg = document.createElement('span'); leg.className = 'kkey-t k7-t16'; leg.textContent = label;
  leg.style.left = L.cap.x + 'px'; leg.style.width = L.cap.w + 'px'; leg.style.top = L.cap.y + 'px'; leg.style.height = L.cap.h + 'px';
  if (o.icon) { o.icon.classList.add('kkey-ic'); leg.prepend(o.icon); }
  b.append(cv, leg);
  let down = false, on = false, dis = false, hot = false;
  const st = (): KeyState => (dis ? 4 : down ? 2 : on ? 3 : hot ? 1 : 0);
  const draw = () => {
    const s = st(), sh = sheet(`key|${w}|${h}|${spec.tone}|${spec.lamp}|${!!o.hazard}`, w, h, KPAD, 5, (f) => keyPart(spec, f as KeyState), { shadow: [2, 2], shadowA: 0.4 });
    const c = cv.getContext('2d')!; c.clearRect(0, 0, cv.width, cv.height);
    if (sh) c.drawImage(sh, 0, s * (h + KPAD * 2), w + KPAD * 2, h + KPAD * 2, 0, 0, w + KPAD * 2, h + KPAD * 2);
    // the legend rides on the cap (the oblique camera slides a raised face up-left)
    const z = KEY_Z[s]; leg.style.transform = `translate(${Math.round(-0.22 * z)}px, ${Math.round(-0.36 * z)}px)`;
    b.classList.toggle('dis', dis);
  };
  draw();
  b.addEventListener('pointerenter', () => { hot = true; if (!dis) uiSfx('hover', 0.3); draw(); });
  b.addEventListener('pointerleave', () => { hot = false; down = false; draw(); });
  b.addEventListener('pointerdown', (e) => { if (e.button > 0 || dis) return; down = true; uiSfx(o.sound ?? 'click', 0.5); draw(); });
  b.addEventListener('pointerup', () => { down = false; draw(); });
  b.addEventListener('click', () => { if (!dis) fn(); });
  b.setOn = (v) => { on = v; draw(); };
  b.setDisabled = (d) => { dis = d; b.disabled = d; draw(); };
  return b;
}

// ------------------------------------------------------------------ css
let css = false;
export function installPanelCSS() {
  if (css) return; css = true;
  const s = document.createElement('style'); s.id = 'k7-panel-css';
  s.textContent = `
:where(.kp-f) { position: relative; isolation: isolate; }
.kp-cv { position: absolute; z-index: -1; pointer-events: none; image-rendering: pixelated; }
.kp { box-sizing: border-box; color: #e8e2c8; font-family: 'Alagard', monospace; }
.kp.kp-flat { background: #22272c; outline: 2px solid #08090c; }
.kp-body { position: relative; min-width: 0; min-height: 0; }
.kslot { position: relative; padding: 0; margin: 0; border: 0; background: none; cursor: pointer; isolation: isolate; flex: none; }
.kslot:focus-visible { outline: none; }
.kslot-cv { position: absolute; z-index: -1; pointer-events: none; image-rendering: pixelated; }
.kslot-ic { position: absolute; display: grid; place-items: center; pointer-events: none; transition: transform .12s cubic-bezier(.3,1.6,.5,1); }
.kslot-ic > .kslot-img { max-width: 100%; max-height: 100%; image-rendering: pixelated; }
.kslot:hover .kslot-ic { transform: translate(-1px, -2px) scale(1.06); }
.kslot:active .kslot-ic { transform: translate(0, 1px) scale(.96); }
.kslot.locked .kslot-ic { filter: grayscale(1) brightness(.45); }
.kslot-n { position: absolute; right: 5px; bottom: 2px; color: #fff4d0; pointer-events: none; }
.kslot-grid { display: grid; }
.kmeter { display: grid; grid-template-columns: 44px auto 1fr; align-items: center; gap: 8px; }
.kmeter-l { color: #d8c890; }
.kmeter-cv { image-rendering: pixelated; display: block; }
.kmeter-v { color: #fff4d0; text-align: right; min-width: 28px; }
.kkey { position: relative; padding: 0; margin: 0; border: 0; background: none; cursor: pointer; isolation: isolate; flex: none; }
.kkey:focus-visible { outline: none; }
.kkey-cv { position: absolute; z-index: -1; pointer-events: none; image-rendering: pixelated; }
.kkey-t { position: absolute; display: flex; align-items: center; justify-content: center; gap: 6px; pointer-events: none; white-space: nowrap; }
.kkey .kkey-t.k7-t16 { color: #1a1408; text-shadow: 0 1px 0 rgba(255,240,200,.35); }
.kkey.dis .kkey-t.k7-t16 { color: #5a5444; }
.kkey-ic { image-rendering: pixelated; }
`;
  document.head.append(s);
}
export type { Tone, LampCol, SlotState, Rect };
