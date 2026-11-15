// The lab's FITTING BAY, its 2D layer. The 3D bay is the showcase; everything the player handles is detailed
// pixel art painted at art resolution and shown at an integer scale:
//   - a TOOL-BOARD along the foot of the screen: a riveted steel pegboard, enamel chipped at the edges, brushed and
//     scratched, with a row of enamel slot tabs (icons) across its top rail. The parts for the picked slot hang on
//     wire hooks: lowpix-painted illustrations (src/ui/assets/cyber/art), each with a little enamel price tag of item
//     icons and counts. Drag one onto the animal (or click it) to fit it; a fitted one wears a stamped check.
//   - ENAMEL TAGS: small enamel signs with a steel rim and chips, an icon and a number, hung by an inked leader line
//     from the part on the body that gives it (CARRY +30 at the cargo frame); the role is a bigger sign.
//   - two enamel plates in the corners: BACK and FILE.
// Text is sparse and only in the house fonts: Departure Mono ('Body', 22 px) and Spleen ('Title', 24/48 px).
import { el, ui, Tip } from './kit';
import { sfx } from '../audio/audio';
import { itemIcon } from '../factory/items';
import { RAMPS } from '../art/palette';
import { CYBER, SLOT_NAME, type Slot } from '../life/cyber/catalog';

/** an enamel tag on the scene: what it points at (screen px), an icon, a value; or a big role sign */
export interface Tag { x: number; y: number; icon: Glyph; text: string; big?: boolean; hot?: boolean; tx?: number; ty?: number; side?: number; lift?: number; tone?: 'cream' | 'amber' | 'red' | 'teal' }
export interface FitHandlers {
  back(): void; file(): void; fileOk(): string | false;
  slot(s: Slot): void; pick(id: string): void;
  /** a part dropped at a screen point: true if it landed on the animal */
  drop(id: string, x: number, y: number): boolean;
  /** the bill of a part: item ids and counts, and whether the stores are short of each */
  bill(id: string): { id: string; n: number; short: boolean }[];
}

// ------------------------------------------------------------------------------------------------ pixel glyphs
/** 12x12 hand-drawn glyphs: o outline, d dark, m mid, l light, h highlight */
const GLYPHS = {
  crate: ['            ', ' oooooooooo ', ' ollllllllo ', ' ommmmmmmmo ', ' omdmmmmdmo ', ' ommdmmdmmo ', ' ommmddmmmo ', ' ommdmmdmmo ', ' omdmmmmdmo ', ' ommmmmmmmo ', ' oddddddddo ', ' oooooooooo '],
  speed: ['            ', '  oo  oo    ', '  olo olo   ', '   olo olo  ', '    olo olo ', '     olo ol ', '     olo ol ', '    olo olo ', '   olo olo  ', '  olo olo   ', '  oo  oo    ', '            '],
  shield: ['            ', ' oooooooooo ', ' ohllmmmmmo ', ' ohlmmmmmdo ', ' olmmmmmmdo ', ' olmmmmmmdo ', '  ommmmmmdo ', '  olmmmmdo  ', '   ommmmdo  ', '    ommdo   ', '     oo     ', '            '],
  eye: ['            ', '            ', '   oooooo   ', '  ollllllo  ', ' ollooooolo ', ' olooddoolo ', ' olooddoolo ', ' ollooooolo ', '  ollllllo  ', '   oooooo   ', '            ', '            '],
  ring: ['            ', '    oooo    ', '   ollllo   ', '  olmoomlo  ', ' olmo  omlo ', ' olo    olo ', ' olo    olo ', ' omdo  odmo ', '  omdoodmo  ', '   ommmmo   ', '    oooo    ', '            '],
  bolt: ['            ', '      ooo   ', '     ollo   ', '    ollo    ', '   ollo     ', '  ollloooo  ', '  ooooolllo ', '     ollo   ', '    ollo    ', '   ollo     ', '   ooo      ', '            '],
  pick: ['            ', '  ooooooo   ', ' ollllllloo ', ' oooo  olllo', '     o  olo ', '    olo  oo ', '   olo      ', '  olo       ', ' olo        ', ' oo         ', '            ', '            '],
  sprout: ['            ', '     oo     ', '  oo olo oo ', ' ollooloolo ', ' olllollllo ', '  ollollo   ', '   oolo     ', '     o      ', '     o      ', '   ooooo    ', '  odddddo   ', '   ooooo    '],
  wrench: ['            ', '  oo    oo  ', ' olo    olo ', ' olloooollo ', '  olllllo   ', '   olllo    ', '    olo     ', '    olo     ', '    olo     ', '   olllo    ', '   olllo    ', '    ooo     '],
  gear: ['            ', '    o  o    ', '   ollllo   ', ' oollllllo  ', '  olloollo  ', ' olloddollo ', ' olloddollo ', '  olloollo  ', ' oollllllo  ', '   ollllo   ', '    o  o    ', '            '],
  drill: ['            ', ' ooooo      ', ' ollllooo   ', ' ommmmlllo  ', ' odddmmmlloo', ' oooodddmmmo', '     oooddo ', '        oo  ', '            ', '            ', '            ', '            '],
  leg: ['            ', '   oooo     ', '   ollo     ', '   olmo     ', '   ommo     ', '  oommoo    ', '  olddlo    ', '   olmo     ', '   olmo     ', '  oollmo    ', ' ollllllo   ', ' oooooooo   '],
  heart: ['            ', '  ooo  ooo  ', ' ollloollmo ', ' ollllllmmo ', ' olllllmmmo ', '  olllmmmo  ', '   ollmmo   ', '    olmo    ', '     oo     ', '            ', '            ', '            '],
  leaf: ['            ', '        ooo ', '      oollo ', '    oolllmo ', '   ollllmo  ', '  ollllmo   ', '  ollmmo    ', ' oolmmo     ', ' o oo       ', 'o           ', '            ', '            '],
  back: ['            ', '     o      ', '    olo     ', '   ollo     ', '  olllooooo ', ' ollllllllo ', '  olllooooo ', '   ollo     ', '    olo     ', '     o      ', '            ', '            '],
  stamp: ['            ', '    oooo    ', '    ollo    ', '    ollo    ', '   oollo    ', '  ollllllo  ', ' oooooooooo ', ' olllllllo  ', ' oddddddddo ', ' oooooooooo ', '            ', '            '],
  check: ['            ', '          oo', '         olo', '        olo ', ' oo    olo  ', ' olo  olo   ', '  olooloo   ', '   ollo     ', '    oo      ', '            ', '            ', '            '],
};
export type Glyph = keyof typeof GLYPHS;
export const SLOT_GLYPH: Record<Slot, Glyph> = { head: 'eye', collar: 'ring', tool: 'drill', back: 'crate', power: 'bolt', armour: 'shield', fore: 'leg', hind: 'leg' };
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const ramp = (name: keyof typeof RAMPS) => (RAMPS[name] as unknown as number[]).map(hex);
/** draw a glyph at art scale 1 (each cell one art pixel) in a ramp */
function glyph(g: CanvasRenderingContext2D, G: Glyph, x: number, y: number, R: string[], ink = '#13161c') {
  const rows = GLYPHS[G], k: Record<string, string> = { o: ink, d: R[1], m: R[Math.min(R.length - 1, 3)], l: R[Math.min(R.length - 1, 4)], h: R[R.length - 1] };
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const c = k[row[i]]; if (c) { g.fillStyle = c; g.fillRect(x + i, y + j, 1, 1); } } });
}
/** a seeded generator so a painted surface is the same every time it is painted */
const rnd = (seed: number) => { let s = seed || 1; return () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296); };
const seedOf = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

// ------------------------------------------------------------------------------------------------ painted materials
/** brushed, riveted steel (optionally a pegboard) with enamel paint chipped at the edges, at art resolution */
function steelPlate(w: number, h: number, o: { seed: number; enamel?: keyof typeof RAMPS; peg?: boolean; rivets?: boolean }) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!;
  const S = ramp('steel'), E = ramp(o.enamel ?? 'olive'), r = rnd(o.seed);
  // the enamel coat over the plate, two tones in long brushed streaks
  g.fillStyle = E[3]; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w;) { const len = 6 + Math.floor(r() * 26), t = r(); if (t < 0.22) { g.fillStyle = E[2]; g.fillRect(x, y, len, 1); } else if (t > 0.86) { g.fillStyle = E[4]; g.fillRect(x, y, len, 1); } x += len; }
  // pegboard holes: a dark punched square, its lower lip catching the light
  if (o.peg) for (let y = 10; y < h - 8; y += 9) for (let x = 9 + ((y / 9) & 1) * 4; x < w - 8; x += 9) { g.fillStyle = S[0]; g.fillRect(x, y, 2, 2); g.fillStyle = E[1]; g.fillRect(x, y - 1, 2, 1); g.fillStyle = E[5] ?? E[4]; g.fillRect(x, y + 2, 2, 1); }
  // chips along the edges: bare steel showing through, a dark rim on the paint
  for (let k = 0; k < (w + h) / 3; k++) {
    const edge = Math.floor(r() * 4), along = r(), x = edge === 0 ? along * w : edge === 1 ? w - 3 - r() * 3 : edge === 2 ? along * w : r() * 3, y = edge === 0 ? r() * 3 : edge === 1 ? along * h : edge === 2 ? h - 3 - r() * 3 : along * h;
    const cw = 1 + Math.floor(r() * 3), ch = 1 + Math.floor(r() * 2);
    g.fillStyle = E[1]; g.fillRect(Math.floor(x) - 1, Math.floor(y), cw + 1, ch + 1); g.fillStyle = S[4]; g.fillRect(Math.floor(x), Math.floor(y), cw, ch);
  }
  // scratches: short diagonal strokes of bare metal
  for (let k = 0; k < w * h / 900; k++) { let x = Math.floor(r() * w), y = Math.floor(r() * h); const n = 3 + Math.floor(r() * 6); g.fillStyle = S[5]; for (let i = 0; i < n; i++) { g.fillRect(x, y, 1, 1); x += 1; if (r() < 0.5) y += 1; } }
  // the bevel: a lit top-left edge, a dark bottom-right edge, an ink outline
  g.fillStyle = E[5] ?? E[4]; g.fillRect(1, 1, w - 2, 1); g.fillRect(1, 1, 1, h - 2);
  g.fillStyle = E[1]; g.fillRect(1, h - 2, w - 2, 1); g.fillRect(w - 2, 1, 1, h - 2);
  g.fillStyle = '#13161c'; g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1); g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h);
  // rivets: a domed head lit up-left with a shadow
  if (o.rivets !== false) for (const [x, y] of [[4, 4], [w - 7, 4], [4, h - 7], [w - 7, h - 7]]) { g.fillStyle = S[1]; g.fillRect(x, y + 1, 3, 2); g.fillStyle = S[5]; g.fillRect(x, y, 2, 2); g.fillStyle = S[6]; g.fillRect(x, y, 1, 1); g.fillStyle = E[1]; g.fillRect(x + 1, y + 3, 3, 1); }
  return c;
}
/** a small enamel tag: a rounded enamel plate in a steel rim, chips, an icon and space for a value */
function enamelTag(w: number, h: number, seed: number, tone: 'cream' | 'amber' | 'red' | 'teal', hot: boolean) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!;
  const E = ramp(tone === 'amber' ? 'ochre' : tone === 'red' ? 'ruby' : tone === 'teal' ? 'teal' : 'paper'), S = ramp('steel'), r = rnd(seed);
  // steel rim with clipped corners, then the enamel field
  g.fillStyle = '#13161c'; g.fillRect(1, 0, w - 2, h); g.fillRect(0, 1, w, h - 2);
  g.fillStyle = S[5]; g.fillRect(1, 1, w - 2, h - 2); g.fillStyle = S[3]; g.fillRect(2, h - 3, w - 3, 1); g.fillRect(w - 3, 2, 1, h - 3);
  g.fillStyle = E[Math.min(E.length - 1, hot ? 5 : 4)]; g.fillRect(3, 3, w - 6, h - 6);
  g.fillStyle = E[E.length - 1]; g.fillRect(3, 3, w - 6, 1);
  g.fillStyle = E[2]; g.fillRect(3, h - 4, w - 6, 1);
  // chips in the enamel
  for (let k = 0; k < 3 + Math.floor(r() * 3); k++) { const x = 3 + Math.floor(r() * (w - 8)), y = r() < 0.5 ? 3 : h - 5; g.fillStyle = E[1]; g.fillRect(x - 1, y, 3, 2); g.fillStyle = S[4]; g.fillRect(x, y, 2, 1); }
  // two little screws
  for (const x of [w - 6]) { g.fillStyle = S[2]; g.fillRect(x, Math.floor(h / 2) - 1, 2, 2); g.fillStyle = S[6]; g.fillRect(x, Math.floor(h / 2) - 1, 1, 1); }
  return c;
}

// ------------------------------------------------------------------------------------------------ the layer
const ART = import.meta.glob('./assets/cyber/art/*.png', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const artUrl = (id: string) => { const f = id === 'cy_hydfore' || id === 'cy_hydhind' ? 'cy_hydleg' : id; return Object.entries(ART).find(([k]) => k.endsWith('/' + f + '.png'))?.[1] ?? ''; };
const K = 2; // art pixels to screen pixels

export class LabFit {
  readonly root: HTMLDivElement;
  private cv: HTMLCanvasElement; private g: CanvasRenderingContext2D;
  private board: HTMLDivElement; private tabs: HTMLDivElement; private rack: HTMLDivElement;
  private back: HTMLButtonElement; private file: HTMLButtonElement;
  private tagCache = new Map<string, HTMLCanvasElement>();
  private ghost: HTMLImageElement | null = null; private held: string | null = null;
  private downAt: { x: number; y: number; moved: boolean } | null = null;
  private onResize = () => this.size();
  private on = false;
  constructor(readonly h: FitHandlers) {
    if (!document.getElementById('lbv-css')) { const st = document.createElement('style'); st.id = 'lbv-css'; st.textContent = 'body.lab-fit .lab { display: none !important; } .lbv img, .lbv canvas { image-rendering: pixelated; }'; document.head.appendChild(st); }
    this.root = el('div', 'lbv', ui()) as HTMLDivElement;
    Object.assign(this.root.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '4', display: 'none' });
    this.cv = el('canvas', '', this.root) as HTMLCanvasElement;
    Object.assign(this.cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    this.g = this.cv.getContext('2d')!;
    // corner plates
    const plate = (glyphId: Glyph, label: string, right: boolean, tip: string, fn: () => void) => {
      const b = el('button', '', this.root) as HTMLButtonElement;
      const w = 34 + label.length * 7, hh = 22, art = steelPlate(w, hh, { seed: seedOf(label), enamel: right ? 'ochre' : 'slate', rivets: false });
      glyph(art.getContext('2d')!, glyphId, 6, 5, ramp(right ? 'paper' : 'snow'));
      Object.assign(b.style, { position: 'absolute', top: '16px', [right ? 'right' : 'left']: '18px', width: w * K + 'px', height: hh * K + 'px', border: 'none', padding: `0 0 0 ${22 * K}px`, pointerEvents: 'auto', cursor: 'pointer', background: `url(${art.toDataURL()}) 0 0 / 100% 100%`, font: "24px 'Title', monospace", color: right ? '#2a2016' : '#e3e1d7', textAlign: 'left' });
      b.textContent = label;
      b.addEventListener('click', (e) => { e.stopPropagation(); sfx('click', 1, 0.6); fn(); });
      b.addEventListener('pointerenter', () => { Tip.show(tip, b); sfx('hover', 1.3, 0.3); b.style.transform = 'translateY(-2px)'; });
      b.addEventListener('pointerleave', () => { Tip.hide(); b.style.transform = ''; });
      return b;
    };
    this.back = plate('back', 'BACK', false, 'Leave the bay [ESC]', () => h.back());
    this.file = plate('stamp', 'FILE', true, 'File the worker', () => h.file());
    // the tool-board
    this.board = el('div', '', this.root) as HTMLDivElement;
    Object.assign(this.board.style, { position: 'absolute', left: '50%', bottom: '10px', transform: 'translateX(-50%)', pointerEvents: 'auto' });
    this.tabs = el('div', '', this.board) as HTMLDivElement;
    Object.assign(this.tabs.style, { position: 'absolute', left: '0', right: '0', top: -14 * K + 'px', height: 18 * K + 'px', display: 'flex', justifyContent: 'center', gap: 3 * K + 'px' });
    this.rack = el('div', '', this.board) as HTMLDivElement;
    Object.assign(this.rack.style, { position: 'absolute', left: 8 * K + 'px', right: 8 * K + 'px', top: 8 * K + 'px', bottom: 6 * K + 'px', display: 'flex', justifyContent: 'center', alignItems: 'stretch', gap: 4 * K + 'px' });
    addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp);
    this.size(); addEventListener('resize', this.onResize);
  }
  private size() { this.cv.width = innerWidth; this.cv.height = innerHeight; }
  setMode(m: 'genes' | 'fit') {
    this.on = m === 'fit';
    this.root.style.display = this.on ? '' : 'none';
    document.body.classList.toggle('lab-fit', this.on);
  }
  /** fill the board: the slot tabs, and the parts that fit the picked slot hanging on their hooks */
  setBoard(slots: Slot[], act: Slot | null, parts: string[], fitted: string[]) {
    const n = Math.max(3, parts.length), slotW = 104, W = Math.max(slots.length * 23 + 24, n * slotW + 20), Hh = 118;
    const plate = steelPlate(W, Hh, { seed: 7, enamel: 'olive', peg: true });
    Object.assign(this.board.style, { width: W * K + 'px', height: Hh * K + 'px', background: `url(${plate.toDataURL()}) 0 0 / 100% 100%` });
    // enamel slot tabs riding the top rail: icons only
    this.tabs.innerHTML = '';
    for (const s of slots) {
      const on = s === act, has = fitted.some((id) => CYBER[id]?.slot === s);
      const tab = enamelTag(20, 18, seedOf(s), on ? 'amber' : has ? 'teal' : 'cream', on);
      glyph(tab.getContext('2d')!, SLOT_GLYPH[s], 4, 3, ramp(on ? 'ochre' : has ? 'teal' : 'brass'));
      const b = el('button', '', this.tabs) as HTMLButtonElement;
      Object.assign(b.style, { width: 20 * K + 'px', height: 18 * K + 'px', border: 'none', padding: '0', marginTop: on ? '0' : 3 * K + 'px', cursor: 'pointer', background: `url(${tab.toDataURL()}) 0 0 / 100% 100%` });
      b.addEventListener('click', (e) => { e.stopPropagation(); sfx('click', 1.3, 0.5); this.h.slot(s); });
      b.addEventListener('pointerenter', () => Tip.show(SLOT_NAME[s], b)); b.addEventListener('pointerleave', () => Tip.hide());
    }
    // the parts on their hooks, each with its price tag of item icons
    this.rack.innerHTML = '';
    if (!parts.length) { const e = el('div', '', this.rack, 'PICK A SLOT'); Object.assign(e.style, { alignSelf: 'center', font: "24px 'Title', monospace", color: '#e5dbc3', textShadow: '2px 2px 0 #13161c' }); }
    for (const id of parts) {
      const p = CYBER[id], isOn = fitted.includes(id), bill = this.h.bill(id), short = bill.some((b) => b.short);
      const cell = el('div', '', this.rack) as HTMLDivElement;
      Object.assign(cell.style, { position: 'relative', width: (slotW - 4) * K + 'px', cursor: short && !isOn ? 'not-allowed' : 'grab' });
      // two wire hooks out of the pegboard
      const hooks = document.createElement('canvas'); hooks.width = 60; hooks.height = 12; const hg = hooks.getContext('2d')!;
      for (const x of [14, 42]) { hg.fillStyle = '#13161c'; hg.fillRect(x, 0, 3, 10); hg.fillRect(x, 8, 7, 3); hg.fillStyle = '#b1b2aa'; hg.fillRect(x + 1, 0, 1, 9); hg.fillRect(x + 1, 9, 5, 1); }
      const hk = el('img', '', cell) as HTMLImageElement; hk.src = hooks.toDataURL(); hk.draggable = false;
      Object.assign(hk.style, { position: 'absolute', left: '50%', top: '0', width: 60 * K + 'px', marginLeft: -30 * K + 'px', pointerEvents: 'none' });
      const img = el('img', '', cell) as HTMLImageElement; img.src = artUrl(id); img.draggable = false;
      Object.assign(img.style, { position: 'absolute', left: '50%', top: 6 * K + 'px', height: 74 * K + 'px', transform: 'translateX(-50%)', filter: short && !isOn ? 'grayscale(0.8) brightness(0.7)' : 'drop-shadow(0 4px 0 rgba(10,8,6,0.4))', pointerEvents: 'none' });
      // the price tag: item icons and counts on enamel (a stamped check once fitted)
      const tag = enamelTag(slotW - 14, 20, seedOf(id), isOn ? 'teal' : short ? 'red' : 'cream', false);
      const tg = el('div', '', cell) as HTMLDivElement;
      Object.assign(tg.style, { position: 'absolute', left: '50%', bottom: '0', transform: 'translateX(-50%)', width: (slotW - 14) * K + 'px', height: 20 * K + 'px', background: `url(${tag.toDataURL()}) 0 0 / 100% 100%`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 * K + 'px', font: "22px 'Body', monospace", color: '#2a2016', pointerEvents: 'none' });
      if (isOn) { const ck = document.createElement('canvas'); ck.width = 12; ck.height = 12; glyph(ck.getContext('2d')!, 'check', 0, 0, ramp('malachite')); const ci = el('img', '', tg) as HTMLImageElement; ci.src = ck.toDataURL(); Object.assign(ci.style, { width: 12 * K + 'px', height: 12 * K + 'px' }); }
      else for (const b of bill.slice(0, 3)) { const s = el('span', '', tg); Object.assign(s.style, { display: 'flex', alignItems: 'center', gap: '2px', color: b.short ? '#8c2238' : '#2a2016' }); const im = el('img', '', s) as HTMLImageElement; try { im.src = itemIcon(b.id); } catch { /* unknown */ } Object.assign(im.style, { width: '22px', height: '22px' }); s.append(String(b.n)); }
      cell.addEventListener('pointerenter', () => { img.style.top = 3 * K + 'px'; Tip.show(`<h4>${p.name}</h4>`, cell); sfx('hover', 1.4, 0.3); });
      cell.addEventListener('pointerleave', () => { img.style.top = 6 * K + 'px'; Tip.hide(); });
      cell.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); Tip.hide(); this.grab(id, img.src, e); });
    }
  }
  /** pick a part off the board: a ghost of it follows the cursor */
  private grab(id: string, src: string, e: PointerEvent) {
    this.held = id; this.downAt = { x: e.clientX, y: e.clientY, moved: false };
    const gh = el('img', '', this.root) as HTMLImageElement; gh.src = src; gh.draggable = false;
    Object.assign(gh.style, { position: 'absolute', height: 74 * K + 'px', pointerEvents: 'none', opacity: '0', transform: 'translate(-50%, -60%)', filter: 'drop-shadow(0 6px 0 rgba(10,8,6,0.45))' });
    this.ghost = gh; this.place(e.clientX, e.clientY);
    sfx('click', 1.5, 0.4);
  }
  private place(x: number, y: number) { if (this.ghost) { this.ghost.style.left = x + 'px'; this.ghost.style.top = y + 'px'; } }
  private onMove = (e: PointerEvent) => {
    if (!this.held || !this.downAt) return;
    if (!this.downAt.moved && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 6) { this.downAt.moved = true; if (this.ghost) this.ghost.style.opacity = '1'; }
    this.place(e.clientX, e.clientY);
  };
  private onUp = (e: PointerEvent) => {
    if (!this.held) return;
    const id = this.held, moved = this.downAt?.moved; this.held = null; this.downAt = null;
    this.ghost?.remove(); this.ghost = null;
    if (!moved) { this.h.pick(id); return; }
    if (!this.h.drop(id, e.clientX, e.clientY)) sfx('close', 1.4, 0.3);
  };
  get dragging() { return !!this.held && !!this.downAt?.moved; }
  /** an inked leader line drawn by hand: a dark underline and a pale line over it, each with its own wobble */
  private ink(pts: { x: number; y: number }[], seed: number, hot: boolean) {
    const g = this.g;
    for (const [col, lw, sd] of [['#13161c', 4, seed], [hot ? '#d8ac5b' : '#e5dbc3', 2, seed + 7]] as [string, number, number][]) {
      const r = rnd(sd); g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'square'; g.lineJoin = 'miter'; g.beginPath();
      pts.forEach((p, i) => { const x = Math.round(p.x + (r() - 0.5) * 1.4) + 0.5, y = Math.round(p.y + (r() - 0.5) * 1.4) + 0.5; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
    }
  }
  /** draw this frame's enamel tags and their leader lines */
  frame(tags: Tag[]) {
    if (!this.on) return;
    const g = this.g, W = this.cv.width;
    g.clearRect(0, 0, W, this.cv.height); g.imageSmoothingEnabled = false; g.textBaseline = 'top';
    for (const t of tags) {
      const seed = seedOf(t.text + t.icon), side = t.side ?? (t.x < W / 2 ? -1 : 1);
      g.font = t.big ? "48px 'Title', monospace" : "24px 'Title', monospace";
      const tw = Math.ceil(g.measureText(t.text).width), aw = Math.ceil(tw / K) + 30, ah = t.big ? 32 : 18;
      const key = `${aw}x${ah}|${t.tone ?? 'cream'}|${t.hot ? 1 : 0}|${t.icon}|${seed}`;
      let art = this.tagCache.get(key);
      if (!art) { art = enamelTag(aw, ah, seed, t.tone ?? 'cream', !!t.hot); glyph(art.getContext('2d')!, t.icon, 5, Math.floor((ah - 12) / 2), ramp(t.tone === 'amber' ? 'ochre' : t.tone === 'red' ? 'ruby' : t.tone === 'teal' ? 'teal' : 'brass')); this.tagCache.set(key, art); }
      const w = aw * K, hh = ah * K;
      const ex = Math.round(t.tx ?? t.x + side * (t.big ? 80 : 56)), ey = Math.round(t.ty ?? t.y - (t.lift ?? 60)), tx = side > 0 ? ex : ex - w, ty = ey - Math.round(hh / 2);
      // the pin where it points, the line, the tag
      g.fillStyle = '#13161c'; g.fillRect(Math.round(t.x) - 4, Math.round(t.y) - 4, 8, 8); g.fillStyle = t.hot ? '#d8ac5b' : '#b1b2aa'; g.fillRect(Math.round(t.x) - 2, Math.round(t.y) - 2, 4, 4);
      this.ink([{ x: t.x, y: t.y }, { x: t.x + side * 12, y: ey }, { x: ex, y: ey }], seed, !!t.hot);
      g.drawImage(art, tx, ty, w, hh);
      g.fillStyle = '#2a2016'; g.font = t.big ? "48px 'Title', monospace" : "24px 'Title', monospace";
      g.fillText(t.text, tx + 20 * K, ty + Math.round((hh - (t.big ? 48 : 24)) / 2) + 1);
    }
    const why = this.h.fileOk(); this.file.style.opacity = why ? '0.6' : '1';
  }
  dispose() {
    removeEventListener('resize', this.onResize); removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp);
    document.body.classList.remove('lab-fit'); this.root.remove(); Tip.hide();
  }
}
