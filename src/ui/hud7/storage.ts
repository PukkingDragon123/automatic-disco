// HUD v7 · STORAGE (bottom left; replaces the crate plate). A small open 3D crate heaped with logs, ore, a lumen
// crystal and a gear (outlined, turning slowly), and beside it a planked shelf on steel brackets carrying the colony's
// TOTAL stock as five big item icons (timber, stone, ore, food, parts) with rolling counts under the plank. A count that
// rises rolls up, its icon pops and a +n floats off it; one that falls rolls down. Click the crate to open the
// container grids (the pod hold and the fullest store side by side); click an icon to open the store that holds most
// of that kind. The crate squashes and springs when pressed.
import type { Game } from '../../game/game';
import { ModelView } from '../kit/model3d';
import { mCrate } from '../kit/models';
import { plate, skin, shadowBlob, pxCanvas } from '../kit/mat';
import { Px, P, INK, rivet } from '../kit/px';
import { Counter, pop, floatUp, burst, squash } from '../kit/juice';
import { uiSfx } from '../kit/sound';
import { installKitStyle } from '../kit/style';
import { itemDef, itemIcon, ITEMS, type ItemId } from '../../factory/items';

type G = Game & Record<string, any>;
interface Cat { k: string; icon: ItemId; name: string; test: (d: ReturnType<typeof itemDef>) => boolean }
const CATS: Cat[] = [
  { k: 'wood', icon: 'wood', name: 'TIMBER', test: (d) => d.group === 'bio' && !d.tags.includes('food') && !d.tags.includes('seed') },
  { k: 'stone', icon: 'rock_granite', name: 'STONE', test: (d) => d.group === 'earth' },
  { k: 'ore', icon: 'ore', name: 'ORE', test: (d) => d.group === 'mineral' },
  { k: 'food', icon: 'berries', name: 'FOOD', test: (d) => d.tags.includes('food') },
  { k: 'parts', icon: 'iron_plate', name: 'PARTS', test: (d) => d.group === 'part' || d.group === 'refined' },
];
const fmt = (n: number) => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.max(0, Math.round(n))));

/** the shelf: a planked board with a lit top edge and a shaded front, on two riveted steel brackets */
function shelfArt(w: number): Px {
  const h = 22, p = new Px(w, h);
  const board = plate(w - 4, 9, { mat: 'gun', seed: 5, chamfer: 2, wear: 0.5, lip: 1, grime: 0.2 });
  p.blit(board, 2, 2);
  p.hl(3, w - 4, 2, P.steel[6]);
  for (let x = 12; x < w - 12; x += 22) { p.rect(x, 6, 3, 2, INK); p.set(x + 1, 6, P.glowTeal[3]); }
  for (const bx of [14, w - 22]) {
    // an L bracket under the board
    p.rect(bx, 11, 8, 3, P.steel[3]); p.rect(bx, 11, 3, 10, P.steel[3]);
    p.hl(bx, bx + 7, 11, P.steel[5]); p.vl(bx, 11, 20, P.steel[5]); p.vl(bx + 2, 14, 20, P.steel[1]);
    for (let k = 0; k < 6; k++) p.set(bx + 3 + k, 14 + Math.floor(k * 0.9), P.steel[2]);
    rivet(p, bx + 1, 17, 1); rivet(p, bx + 5, 12, 1);
  }
  p.outline(INK);
  return p;
}

export class StorageWidget {
  readonly el: HTMLDivElement;
  private view: ModelView;
  private slots: { cat: Cat; el: HTMLDivElement; icon: HTMLImageElement; count: Counter; last: number }[] = [];
  private acc = 0; private first = true; private lastFloat = 0;
  constructor(readonly g: G) {
    installKitStyle(); injectStorageCSS();
    const el = this.el = document.createElement('div'); el.className = 'h7-store';
    // the crate over its shadow
    const crate = document.createElement('button'); crate.type = 'button'; crate.className = 'h7-crate'; crate.setAttribute('aria-label', 'Stores');
    crate.append(pxCanvas(shadowBlob(60, 10, 0.6), 2, 'h7-crate-sh'));
    this.view = new ModelView(mCrate, { w: 74, h: 64, scale: 2, spin: 0, yaw0: 0.55, hotSpin: 0.9, pitch: 0.62, zoom: 1.22 });
    crate.append(this.view.cv);
    crate.addEventListener('pointerenter', (e) => { this.view.hot(true); if (e.pointerType === 'mouse') uiSfx('hover', 0.5); });
    crate.addEventListener('pointermove', (e) => this.view.point(e.clientX, e.clientY));
    crate.addEventListener('pointerleave', () => this.view.hot(false));
    crate.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.view.press(1.2); squash(crate, 0.6); uiSfx('clunk', 0.6); });
    crate.addEventListener('click', (e) => { e.stopPropagation(); this.expand(true); });
    // the shelf of totals
    const shelf = document.createElement('div'); shelf.className = 'h7-shelf';
    const row = document.createElement('div'); row.className = 'h7-shelf-row';
    const plank = pxCanvas(shelfArt(CATS.length * 70 + 8), 2, 'h7-plank');
    plank.style.width = (CATS.length * 70 + 8) + 'px'; plank.style.height = '44px';
    const counts = document.createElement('div'); counts.className = 'h7-shelf-counts';
    for (const cat of CATS) {
      const s = document.createElement('div'); s.className = 'h7-res'; s.title = '';
      const ic = document.createElement('img'); ic.className = 'h7-res-ic'; ic.alt = cat.name; ic.src = itemIcon(cat.icon, 64); ic.draggable = false;
      s.append(ic); row.append(s);
      const cw = document.createElement('div'); cw.className = 'h7-res-n';
      const count = new Counter(cw, { size: 32, fmt, sound: false });
      counts.append(cw);
      s.addEventListener('pointerenter', () => { uiSfx('hover', 0.4); s.classList.add('hot'); });
      s.addEventListener('pointerleave', () => s.classList.remove('hot'));
      s.addEventListener('click', (e) => { e.stopPropagation(); squash(s, 0.8); this.openFor(cat); });
      this.slots.push({ cat, el: s, icon: ic, count, last: 0 });
    }
    shelf.append(row, plank, counts);
    el.append(crate, shelf);
    // the icon art arrives late (item sprites load lazily): refresh once a second for a while
    let tries = 0; const t = setInterval(() => { for (const s of this.slots) s.icon.src = itemIcon(s.cat.icon, 64); if (++tries > 6) clearInterval(t); }, 1200);
  }
  private totals(): Record<string, number> {
    const out: Record<string, number> = {}; for (const c of CATS) out[c.k] = 0;
    const st = this.g.storage; if (!st) return out;
    for (const c of st.all()) for (const s of c.contents()) {
      const d = ITEMS[s.item] ? itemDef(s.item) : null; if (!d) continue;
      for (const cat of CATS) if (cat.test(d)) { out[cat.k] += s.n; break; }
    }
    return out;
  }
  update(dt: number) {
    this.acc -= dt; if (this.acc > 0) return; this.acc = 0.4;
    const t = this.totals(), now = performance.now();
    for (const s of this.slots) {
      const n = t[s.cat.k] ?? 0;
      if (n === s.last && !this.first) continue;
      const up = n > s.last;
      s.count.set(n, this.first);
      if (!this.first && up) {
        pop(s.icon, 0.7);
        if (now - this.lastFloat > 300) { this.lastFloat = now; const r = s.icon.getBoundingClientRect(); floatUp(r.left + r.width / 2, r.top - 4, '+' + fmt(n - s.last), { size: 16, color: '#cfe8a8' }); uiSfx('pluck', 0.35, 1.2); }
      }
      s.last = n;
    }
    this.first = false;
  }
  /** open the container grids (the hold, and the fullest store beside it) */
  expand(on: boolean) {
    if (!on) return;
    const st = this.g.storage; if (!st) { uiSfx('error', 0.4); return; }
    void import('../crates/grid').then(({ invUI }) => {
      const ui = invUI(this.g); if (!ui) return;
      const all = st.all() as { contents(): { n: number }[] }[];
      const r = this.view.cv.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height * 0.4, { n: 14, ramp: P.ochre, speed: 200, up: 140, spread: 1.4, gravity: 700, kind: 'chip', life: 0.7 });
      uiSfx('open', 0.6);
      this.view.poke(6);
      ui.open(all[0] as never);
      const fullest = all.slice(1).map((c) => ({ c, n: c.contents().reduce((s, q) => s + q.n, 0) })).sort((a, b) => b.n - a.n)[0];
      if (fullest && fullest.n > 0) ui.open(fullest.c as never);
    });
  }
  private openFor(cat: Cat) {
    const st = this.g.storage; if (!st) return;
    void import('../crates/grid').then(({ invUI }) => {
      const ui = invUI(this.g); if (!ui) return;
      let best: unknown = null, bn = 0;
      for (const c of st.all()) { let n = 0; for (const s of c.contents()) { const d = ITEMS[s.item] ? itemDef(s.item) : null; if (d && cat.test(d)) n += s.n; } if (n > bn) { bn = n; best = c; } }
      if (best) { uiSfx('open', 0.5); ui.open(best as never); } else uiSfx('error', 0.4);
    });
  }
}

let css = false;
function injectStorageCSS() {
  if (css) return; css = true;
  const s = document.createElement('style');
  s.textContent = `
.h7-store { position: fixed; left: 10px; bottom: 8px; z-index: 35; display: flex; align-items: flex-end; gap: 6px; pointer-events: none; }
.h7-crate { position: relative; border: 0; background: none; padding: 0; margin: 0 0 6px; cursor: pointer; pointer-events: auto; line-height: 0; transform-origin: 50% 100%; transition: transform .22s cubic-bezier(.2,.9,.3,1.5), filter .15s; }
.h7-crate:hover { transform: translateY(-6px); filter: brightness(1.15) drop-shadow(0 0 8px rgba(255,200,110,.55)); }
.h7-crate .k7-model { position: relative; z-index: 1; display: block; }
.h7-crate-sh { position: absolute; left: 50%; bottom: 2px; transform: translateX(-50%); z-index: 0; }
.h7-shelf { position: relative; display: flex; flex-direction: column; align-items: flex-start; pointer-events: auto; }
.h7-shelf-row { display: flex; gap: 6px; padding: 0 4px 0 8px; margin-bottom: -10px; position: relative; z-index: 1; }
.h7-res { position: relative; width: 64px; height: 64px; cursor: pointer; transform-origin: 50% 100%; transition: transform .2s cubic-bezier(.2,.9,.3,1.6), filter .15s; }
.h7-res.hot { transform: translateY(-6px) scale(1.06); filter: brightness(1.2) drop-shadow(0 0 6px rgba(255,200,110,.6)); }
.h7-res-ic { display: block; width: 64px; height: 64px; image-rendering: pixelated; filter: drop-shadow(3px 3px 0 rgba(5,6,8,.5)); pointer-events: none; }
.h7-plank { display: block; position: relative; z-index: 0; }
.h7-shelf-counts { display: flex; gap: 6px; padding: 0 4px 0 8px; margin-top: -6px; }
.h7-res-n { width: 64px; display: flex; justify-content: center; }
`;
  document.head.append(s);
}
