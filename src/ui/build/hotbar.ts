// The HOTBAR: ten quick-slots under the view (keys 1-0 in build mode), filled by dragging tiles from the planner.
// Each slot is a small phosphor window with the building's studio render, its key, and a pilot lamp: green when it
// can be built now, red when the stores lack its materials, dark while it is still locked. Drag a slot off the bar to
// clear it, onto another slot to swap. The layout lives in V6.md (pod agent owns the HUD; it may move --hb-bottom).
import './build.css';
import type { Factory } from '../../factory/factory';
import type { Build } from '../../factory/build';
import { FDEFS, type FKind } from '../../factory/defs';
import { buildingLock } from '../../logistics/unlocks';
import { registerColonyBuildings } from '../../logistics/catalog';
import { still } from './studio';
import { el } from '../kit';
import { sfx } from '../../audio/audio';

const DEFAULT: (FKind | null)[] = ['miner1', 'belt1', 'crate', 'smelter', 'constructor', 'pole', 'sawbench', 'cropplot', 'barracks', 'turret'];

export class Hotbar {
  readonly root: HTMLDivElement;
  slots: (FKind | null)[];
  private els: HTMLDivElement[] = [];
  private name: HTMLDivElement;
  private key = '';
  private drag: { i: number; x: number; y: number; on: boolean; ghost: HTMLDivElement | null } | null = null;
  constructor(readonly f: Factory, readonly b: Build) {
    registerColonyBuildings();
    const run = f.g.run as unknown as { hotbar?: (FKind | null)[] };
    this.slots = (run.hotbar && run.hotbar.length === 10 ? run.hotbar : DEFAULT).map((k) => (k && FDEFS[k] ? k : null));
    run.hotbar = this.slots;
    const r = (this.root = el('div', 'cr hb', document.body));
    this.name = el('div', 'hb-name cr-s', r);
    for (let i = 0; i < 10; i++) {
      const s = el('div', 'hb-slot', r);
      s.dataset.slot = String(i);
      s.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.button === 2) { this.set(i, null); sfx('click', 0.8, 0.4); return; } if (e.button === 0) this.drag = { i, x: e.clientX, y: e.clientY, on: false, ghost: null }; });
      s.addEventListener('contextmenu', (e) => e.preventDefault());
      s.addEventListener('pointerenter', () => { const k = this.slots[i]; this.name.textContent = k ? `${FDEFS[k].name.toUpperCase()}${buildingLock(f.g, k).ok ? '' : ' · LOCKED'}` : 'EMPTY: DRAG A BUILDING HERE'; this.name.classList.add('show'); });
      s.addEventListener('pointerleave', () => this.name.classList.remove('show'));
      this.els.push(s);
    }
    r.addEventListener('wheel', (e) => e.stopPropagation());
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp);
    this.render();
  }
  dispose() { removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); this.root.remove(); }
  set(i: number, k: FKind | null) {
    if (i < 0 || i > 9) return;
    // one slot per building: setting it elsewhere moves it
    if (k) { const j = this.slots.indexOf(k); if (j >= 0 && j !== i) this.slots[j] = this.slots[i]; }
    this.slots[i] = k;
    this.key = ''; this.render();
  }
  /** a slot's key was pressed: take that building in hand */
  use(i: number) {
    const k = this.slots[i];
    if (!k) { sfx('deny'); return; }
    this.b.choose(k);
  }
  /** the slot under a screen point (drop target), or -1 */
  dropAt(x: number, y: number): number {
    const t = document.elementFromPoint(x, y)?.closest('.hb-slot') as HTMLElement | null;
    return t ? Number(t.dataset.slot) : -1;
  }
  dropHover(x: number, y: number) { const i = x < 0 ? -1 : this.dropAt(x, y); this.els.forEach((e, j) => e.classList.toggle('drop', j === i)); }
  private onMove = (e: PointerEvent) => {
    const d = this.drag; if (!d) return;
    if (!d.on && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 && this.slots[d.i]) { d.on = true; d.ghost = el('div', 'pl-drag', document.body, `<img src="${still(this.slots[d.i]!, 52, 30)}" alt="">`); }
    if (d.on && d.ghost) { d.ghost.style.left = e.clientX + 'px'; d.ghost.style.top = e.clientY + 'px'; this.dropHover(e.clientX, e.clientY); }
  };
  private onUp = (e: PointerEvent) => {
    const d = this.drag; if (!d) return;
    this.drag = null;
    if (!d.on) { if (e.button === 0) this.use(d.i); return; }
    d.ghost?.remove(); this.dropHover(-1, -1);
    const j = this.dropAt(e.clientX, e.clientY);
    if (j === d.i) return;
    if (j < 0) { this.slots[d.i] = null; sfx('click', 0.8, 0.4); }
    else { const t = this.slots[j]; this.slots[j] = this.slots[d.i]; this.slots[d.i] = t; sfx('click', 1.2, 0.4); }
    this.key = ''; this.render();
  };
  render() {
    const f = this.f, g = f.g, b = this.b;
    const have = (id: string) => (f.sites ? f.sites.avail(id) : f.count(id));
    const st = this.slots.map((k) => {
      if (!k || !FDEFS[k]) return 'e';
      if (!buildingLock(g, k).ok) return 'l';
      const c = f.sites ? f.sites.costOf(FDEFS[k]) : FDEFS[k].cost;
      return Object.entries(c).every(([id, n]) => have(id) >= (n ?? 0)) ? 'y' : 'n';
    });
    const key = this.slots.join(',') + '|' + st.join('') + '|' + (b.active ? b.kind : '-');
    this.root.classList.toggle('dim', !b.active);
    if (key === this.key) return;
    this.key = key;
    this.els.forEach((e, i) => {
      const k = this.slots[i];
      e.classList.toggle('empty', !k);
      e.classList.toggle('on', !!k && b.active && b.kind === k);
      e.innerHTML = `<span class="n cr-s">${(i + 1) % 10}</span>${k ? `<img src="${still(k, 32, 22)}" alt="" draggable="false"><span class="lamp ${st[i] === 'n' ? 'no' : st[i] === 'l' ? 'lk' : ''}"></span>` : ''}`;
    });
  }
  private t = 0;
  update(dt: number) { this.t -= dt; if (this.t <= 0) { this.t = 0.4; this.render(); } }
}
