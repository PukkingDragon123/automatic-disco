// A container, opened: a 2D pixel-art panel cut from the container's own material (ui/crates/mat.ts), its grid drawn
// into that material (compartments, slots, pockets, bays, racks, ports, drawers, trays), its items as their lowpix
// sprites at whole-number scale with the stack count in Departure Mono. Drag to move (R or right-click while dragging
// turns a long item); drop on a twin to merge, on the other open panel to move across; right-click splits; shift-drag
// carries half; double-click sends a stack across. Sort is a row of material tabs, filter a row of stamped item tabs
// and an etched search line; the gear opens the settings plate (name, logo, paint, priority, takes, crew). Hover shows
// a compact card: the item larger, its name and its numbers.
import type { Game } from '../../game/game';
import { ITEMS, ITEM_IDS, ITEM_GROUPS, itemDef, itemIcon, type ItemId, type ItemGroup } from '../../factory/items';
import type { Container, Stack, SortKey } from '../../inv/container';
import type { Storage } from '../../inv/storage';
import { DAY } from '../../inv/storage';
import { KIND_INFO, PAINTS, PAINT_IDS, LOGO_IDS } from '../../inv/kinds';
import { drawLogoBadge } from '../../inv/tex';
import { LOGOS, LOGO_NAME } from '../../inv/logos';
import { injectCrateCSS } from './style';
import { panelURL, plainURL, ctlURL, cardURL, loadMats, onMats, gaugeRect, GLYPH, MAT, Pen, type PanelLayout } from './mat';
import { RAMPS } from '../../art/palette';
import { sfx } from '../../audio/audio';

const SORTS: { k: SortKey; g: string; tip: string }[] = [{ k: 'type', g: 'type', tip: 'Sort by kind' }, { k: 'name', g: 'name', tip: 'Sort A-Z' }, { k: 'count', g: 'count', tip: 'Sort by count' }, { k: 'value', g: 'value', tip: 'Sort by value' }, { k: 'fresh', g: 'fresh', tip: 'Stalest first' }];
/** the item each kind of thing is stamped with */
const GROUP_ICON: Record<ItemGroup, ItemId> = { bio: 'wood', seed: 'seed_tree', specimen: 'tissue', earth: 'soil', mineral: 'crystal', fluid: 'water', refined: 'iron_ingot', part: 'gear' };
const ik = () => (innerHeight >= 1000 ? 2 : 1);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export type InvEvent = 'opened' | 'sorted' | 'filtered' | 'split' | 'moved' | 'merged' | 'settings' | 'priority' | 'filterset' | 'closed';
/** art-pixel layout (shown at --ik): frame, header band, controls row, grid of 36 px cells, foot */
const F = 8, HEAD = 20, CTRL = 16, GAP = 3, CELL = 36, FOOT = 12, MINW = 236;
export function layoutOf(c: Container, fill = 0): PanelLayout {
  const w = 2 * F + Math.max(c.W * CELL, MINW), gx = F + Math.floor((w - 2 * F - c.W * CELL) / 2), ctrlY = F + HEAD + GAP, gy = ctrlY + CTRL + GAP + 2;
  return { w, h: gy + c.H * CELL + 2 + GAP + FOOT + F, head: HEAD, gx, gy, cols: c.W, rows: c.H, cell: CELL, fill, frame: F, ctrlY };
}
const px = (v: number) => v * ik() + 'px';

interface Drag { w: InvWindow; s: Stack; n: number; rot: 0 | 1; gx: number; gy: number; ghost: HTMLElement; moved: boolean; sx: number; sy: number }

class InvWindow {
  readonly root: HTMLDivElement;
  private plate: HTMLCanvasElement;
  private gridEl: HTMLDivElement; private chips: HTMLDivElement; private srt: HTMLDivElement; private foot: HTMLDivElement; private note: HTMLDivElement; setEl: HTMLDivElement;
  private search: HTMLInputElement; private searchEl: HTMLDivElement;
  private drop: HTMLDivElement;
  private ver = -1; private look = ''; private L: PanelLayout;
  group: ItemGroup | null = null; query = '';
  sortKey: SortKey | null = null;
  settings = false;
  /** the settings plate shows every item it could take only when asked (else what it holds and what is set) */
  allPicks = false;
  constructor(readonly ui: InvUI, readonly c: Container) {
    const r = (this.root = document.createElement('div'));
    r.className = 'inv-win pop';
    r.innerHTML = `
      <div class="inv-head"><canvas class="plate" width="16" height="16"></canvas><div class="lab inv-t"></div><div class="inv-pri" title="Priority"></div>
        <img class="inv-ctl gear" title="Settings"><img class="inv-ctl x" title="Close (Esc)"></div>
      <div class="inv-ctrls"><div class="inv-bar srt"></div><div class="inv-bar chips"></div><div class="inv-search"><input type="text" spellcheck="false" placeholder="find"></div></div>
      <div class="inv-grid"></div>
      <div class="inv-foot"><div class="gauge"><b></b></div><div class="nums"><span class="cells"></span><span class="mass"></span></div></div><div class="inv-note"></div>`;
    this.plate = r.querySelector('canvas.plate')!;
    this.gridEl = r.querySelector('.inv-grid')!; this.chips = r.querySelector('.chips')!; this.srt = r.querySelector('.srt')!;
    this.foot = r.querySelector('.inv-foot')!; this.note = r.querySelector('.inv-note')!;
    this.searchEl = r.querySelector('.inv-search')!; this.search = r.querySelector('input')!;
    this.setEl = document.createElement('div'); this.setEl.className = 'inv-set'; this.setEl.style.display = 'none'; r.appendChild(this.setEl);
    this.drop = document.createElement('div'); this.drop.className = 'inv-drop'; this.drop.style.display = 'none';
    this.L = layoutOf(c);
    for (const s of SORTS) {
      const b = document.createElement('img'); b.className = 'inv-ctl tab'; b.dataset.sort = s.k; b.title = s.tip;
      b.onclick = () => this.doSort(s.k);
      b.onpointerenter = () => this.paintCtls(); b.onpointerleave = () => this.paintCtls();
      this.srt.appendChild(b);
    }
    const gear = r.querySelector<HTMLImageElement>('.gear')!, x = r.querySelector<HTMLImageElement>('.x')!;
    x.onclick = () => ui.close(this);
    gear.onclick = () => { this.settings = !this.settings; this.renderSettings(); this.keepOnScreen(); sfx('click', 1, 0.5); if (this.settings) ui.fire('settings', this.c); };
    this.search.addEventListener('input', () => { this.query = this.search.value.trim().toLowerCase(); this.applyFilter(); if (this.query) ui.fire('filtered', this.c); });
    this.search.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { this.search.value = ''; this.query = ''; this.applyFilter(); this.search.blur(); } });
    const head = r.querySelector<HTMLDivElement>('.inv-head')!;
    head.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.inv-ctl')) return;
      const x0 = e.clientX - r.offsetLeft, y0 = e.clientY - r.offsetTop;
      const mv = (ev: PointerEvent) => { r.style.left = Math.round(Math.max(0, Math.min(innerWidth - 80, ev.clientX - x0))) + 'px'; r.style.top = Math.round(Math.max(0, Math.min(innerHeight - 60, ev.clientY - y0))) + 'px'; this.ui.moved = true; };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    r.addEventListener('pointerdown', () => ui.front(this));
    r.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    r.addEventListener('contextmenu', (e) => e.preventDefault());
    document.body.appendChild(r);
    setTimeout(() => r.classList.remove('pop'), 300);
    onMats(() => { this.look = ''; this.ver = -1; });
    this.frame();
  }
  /** a panel that grew (the settings plate) slides up to stay on screen */
  keepOnScreen() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const b = this.root.getBoundingClientRect(), sb = this.settings ? this.setEl.getBoundingClientRect() : null, bottom = Math.max(b.bottom, sb?.bottom ?? 0);
      if (bottom > innerHeight - 8) { const k = ik(); this.root.style.top = Math.round(Math.max(8, b.top - (bottom - (innerHeight - 8))) / k) * k + 'px'; this.ui.moved = true; }
    }));
  }
  /** the painted panel, the header's logo plate and label, the priority pips, the controls */
  private renderHead() {
    const fillKey = Math.round(this.c.fill() * 12);
    const look = `${this.c.logo}|${this.c.color}|${this.c.label}|${this.c.priority}|${this.c.W}x${this.c.H}|${fillKey}|${ik()}`;
    if (look === this.look) return;
    this.look = look;
    const L = (this.L = layoutOf(this.c, this.c.fill())), k = ik(), r = this.root;
    Object.assign(r.style, { width: L.w * k + 'px', height: L.h * k + 'px', backgroundImage: `url(${panelURL(this.c.kind, L, this.c.id)})`, backgroundSize: `${L.w * k}px ${L.h * k}px` });
    const head = r.querySelector<HTMLDivElement>('.inv-head')!;
    Object.assign(head.style, { left: px(F), top: px(F), width: px(L.w - 2 * F), height: px(HEAD) });
    drawLogoBadge(this.plate.getContext('2d')!, this.c.logo, this.c.color, 16, 16);
    r.querySelector('.lab')!.textContent = this.c.label;
    const m = MAT[this.c.kind];
    r.querySelector<HTMLElement>('.lab')!.style.color = '#' + m.light.toString(16).padStart(6, '0');
    const pri = r.querySelector<HTMLDivElement>('.inv-pri')!;
    pri.innerHTML = this.c.kind === 'hold' ? '' : [1, 2, 3, 4, 5].map((q) => `<img src="${pipURL(q <= this.c.priority)}">`).join('');
    const gear = r.querySelector<HTMLImageElement>('.gear')!; gear.style.display = this.c.kind === 'hold' ? 'none' : '';
    const ctrls = r.querySelector<HTMLDivElement>('.inv-ctrls')!;
    Object.assign(ctrls.style, { left: px(F + 1), top: px(L.ctrlY), width: px(L.w - 2 * F - 2), height: px(CTRL) });
    Object.assign(this.gridEl.style, { left: px(L.gx), top: px(L.gy), width: px(L.cols * CELL), height: px(L.rows * CELL) });
    const [gx, gy, gw] = gaugeRect(L);
    Object.assign(this.foot.style, { left: px(gx), top: px(gy - 2), width: px(L.w - 2 * F - 4), height: px(12) });
    Object.assign(this.foot.querySelector<HTMLElement>('.gauge')!.style, { left: px(2), top: px(4), width: px(gw - 4) });
    Object.assign(this.note.style, { left: px(L.gx + 2), top: px(L.gy + L.rows * CELL - 16) });
    this.paintCtls();
  }
  /** the material tabs: sort (active one stamped), gear and close */
  private paintCtls() {
    const kind = this.c.kind, r = this.root;
    this.srt.querySelectorAll<HTMLImageElement>('img').forEach((b, i) => { const s = SORTS[i]; b.src = ctlURL(kind, 16, 16, this.sortKey === s.k ? 2 : b.matches(':hover') ? 1 : 0, GLYPH[s.g], i + 1); });
    const g = r.querySelector<HTMLImageElement>('.gear')!, x = r.querySelector<HTMLImageElement>('.x')!;
    g.src = ctlURL(kind, 16, 16, this.settings ? 2 : 0, GLYPH.gear, 7); x.src = ctlURL(kind, 16, 16, 0, GLYPH.close, 8);
    this.searchEl.style.backgroundImage = `url(${ctlURL(kind, 64, 16, this.query ? 2 : 0, undefined, 9)})`;
  }
  /** a stamped tab per kind of thing held (its item stands for it) */
  private renderChips() {
    const by = new Map<ItemGroup, number>();
    for (const s of this.c.stacks) { const g = itemDef(s.item).group; by.set(g, (by.get(g) ?? 0) + s.n); }
    const groups = ITEM_GROUPS.filter((g) => by.get(g.k) || this.group === g.k);
    this.chips.innerHTML = groups.map((g, i) => `<button class="inv-chip" data-g="${g.k}" title="${g.name}: ${by.get(g.k) ?? 0}" style="background-image:url(${ctlURL(this.c.kind, 18, 16, this.group === g.k ? 2 : 0, undefined, i + 11)})"><img src="${itemIcon(GROUP_ICON[g.k], 32)}"></button>`).join('');
    this.chips.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => { const g = b.dataset.g as ItemGroup; this.group = this.group === g ? null : g; sfx('click', 1.2, 0.4); this.renderChips(); this.applyFilter(); this.ui.fire('filtered', this.c); }));
  }
  private matches(s: Stack) {
    const d = itemDef(s.item);
    if (this.group && d.group !== this.group) return false;
    if (this.query && !(d.name.toLowerCase().includes(this.query) || d.group.includes(this.query) || d.tags.some((t) => t.includes(this.query)))) return false;
    return true;
  }
  applyFilter() {
    const any = !!this.group || !!this.query;
    this.gridEl.querySelectorAll<HTMLDivElement>('.inv-stack').forEach((el) => { const s = this.c.stacks[Number(el.dataset.i)]; if (!s) return; const m = this.matches(s); el.classList.toggle('dim', any && !m); el.classList.toggle('hit', any && m); });
    this.paintCtls();
  }
  /** each stack: its sprite at whole-number scale over its cells, the count, a freshness tick when it spoils */
  renderGrid() {
    const C = CELL * ik(), sp = 32 * ik();
    let html = '';
    this.c.stacks.forEach((s, i) => {
      const [w, h] = this.c.dims(s.item, s.rot), d = itemDef(s.item), p = d.perish, keep = this.c.keeps(s.item);
      const fr = p ? `<i class="fr ${keep ? 'keep' : s.fresh < 0.25 ? 'bad' : s.fresh < 0.5 ? 'warn' : ''}" style="width:${Math.max(1, Math.round((w * CELL - 8) * s.fresh)) * ik()}px"></i>` : '';
      const turned = s.rot && w !== h ? 'transform:rotate(90deg);' : '';
      html += `<div class="inv-stack" data-i="${i}" style="left:${s.x * C}px;top:${s.y * C}px;width:${w * C}px;height:${h * C}px">` +
        `<img src="${itemIcon(s.item, 64)}" style="left:${(w * C - sp) / 2}px;top:${(h * C - sp) / 2}px;width:${sp}px;height:${sp}px;${turned}">${s.n > 1 ? `<span class="cnt">${s.n}</span>` : ''}${fr}</div>`;
    });
    this.gridEl.innerHTML = html;
    this.gridEl.appendChild(this.drop);
    this.gridEl.querySelectorAll<HTMLDivElement>('.inv-stack').forEach((el) => this.bindStack(el));
    this.applyFilter();
  }
  private bindStack(el: HTMLDivElement) {
    const i = Number(el.dataset.i);
    el.addEventListener('pointerdown', (e) => {
      const s = this.c.stacks[i]; if (!s || this.ui.drag) return;
      if (e.button === 2) { e.preventDefault(); this.splitHalf(s); return; }
      if (e.button !== 0) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect(), C = CELL * ik();
      this.ui.startDrag(this, s, e.shiftKey && s.n > 1 ? Math.ceil(s.n / 2) : s.n, Math.floor((e.clientX - rect.left) / C), Math.floor((e.clientY - rect.top) / C), e);
    });
    el.addEventListener('dblclick', () => { const s = this.c.stacks[i]; if (s) this.ui.quickMove(this, s); });
    el.addEventListener('pointerenter', (e) => { const s = this.c.stacks[i]; if (s && !this.ui.drag) this.ui.card(this, s, e.clientX, e.clientY); });
    el.addEventListener('pointermove', (e) => { if (!this.ui.drag) this.ui.cardMove(e.clientX, e.clientY); });
    el.addEventListener('pointerleave', () => this.ui.card(null));
  }
  splitHalf(s: Stack) {
    if (s.n < 2) return;
    const ns = this.c.split(s, Math.floor(s.n / 2));
    if (!ns) { this.flashNote('no room'); sfx('deny'); return; }
    sfx('click', 0.8, 0.6); this.ui.store.changed(this.c); this.ui.fire('split', this.c);
  }
  private renderFoot() {
    const used = this.c.fill(), mass = this.c.stacks.reduce((m, s) => m + itemDef(s.item).mass * s.n, 0), cells = Math.round(used * this.c.W * this.c.H);
    const b = this.foot.querySelector<HTMLElement>('.gauge b')!;
    b.style.width = Math.round((gaugeRect(this.L)[2] - 4) * Math.min(1, used)) * ik() + 'px'; b.classList.toggle('full', used > 0.9);
    const pw = KIND_INFO[this.c.kind].power && !this.c.powered() ? ' <b class="r">!</b>' : '';
    this.foot.querySelector('.cells')!.innerHTML = `${cells}/${this.c.W * this.c.H}${pw}`;
    this.foot.querySelector('.mass')!.textContent = fmtKg(mass);
  }
  private noteT = 0;
  flashNote(s: string) { this.note.textContent = s; this.noteT = performance.now() + 2400; }
  doSort(k: SortKey) {
    const desc = this.sortKey === k;
    this.c.sort(k, desc); this.sortKey = desc ? null : k;
    this.paintCtls();
    sfx('click', 0.9, 0.6); this.ui.store.changed(this.c); this.ui.fire('sorted', this.c);
  }
  // ---------------------------------------------------------------- the settings plate (icons, no prose)
  renderSettings() {
    const c = this.c, el = this.setEl, k = ik(), L = this.L;
    el.style.display = this.settings ? '' : 'none';
    this.paintCtls();
    if (!this.settings) return;
    const takes = ITEM_IDS.filter((id) => ITEMS[id].cat !== 'internal' && c.takesKind(id) && (this.allPicks || c.allow.includes(id) || c.deny.includes(id) || c.stacks.some((s) => s.item === id)));
    el.style.height = '';
    const crew = this.ui.store.linked(c);
    const g = gimg;
    el.innerHTML = `
      <div class="row">${g('type')}<input class="lbl inv-t" maxlength="10" value="${esc(c.label)}"></div>
      <div class="row">${LOGO_IDS.map((l) => `<img class="opt" data-l="${l}" title="${LOGO_NAME[l]}" src="${ctlURL(c.kind, 16, 16, c.logo === l ? 2 : 0, LOGOS[l], 31)}">`).join('')}</div>
      <div class="row">${g('drop')}${PAINT_IDS.map((p) => `<img class="opt sw" data-p="${p}" title="${PAINTS[p].name}" src="${swatchURL(PAINTS[p].ramp, c.color === p)}">`).join('')}<span class="sp"></span>${g('pin')}${[1, 2, 3, 4, 5].map((q) => `<img class="opt pip" data-pr="${q}" src="${pipURL(q <= c.priority)}">`).join('')}</div>
      <div class="row picks">${g('funnel')}<div class="inv-picks">${takes.map((id) => `<button data-it="${id}" class="${c.allow.includes(id) ? 'allow' : c.deny.includes(id) ? 'deny' : ''}" title="${esc(ITEMS[id].name)}"><img src="${itemIcon(id, 32)}"></button>`).join('')}<img class="opt more" title="${this.allPicks ? 'Fewer' : 'Every item it takes'}" src="${ctlURL(c.kind, 14, 14, this.allPicks ? 2 : 0, this.allPicks ? GLYPH.left : GLYPH.plus, 43)}"></div></div>
      <div class="row">${g('worker')}${crew.map((w, i) => `<span class="w">${esc(w.c.sp.name)}<b data-un="${i}">×</b></span>`).join('')}<img class="opt link" title="Link the nearest idle worker" src="${ctlURL(c.kind, 14, 14, 0, GLYPH.plus, 41)}"></div>`;
    Object.assign(el.style, { width: L.w * k + 'px', top: L.h * k + 'px' });
    requestAnimationFrame(() => { const hh = Math.round(el.getBoundingClientRect().height / k); el.style.height = hh * k + 'px'; el.style.backgroundImage = `url(${plainURL(c.kind, L.w, hh, c.id + 3)})`; el.style.backgroundSize = `${L.w * k}px ${hh * k}px`; });
    const lbl = el.querySelector<HTMLInputElement>('input.lbl')!;
    lbl.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') lbl.blur(); });
    lbl.addEventListener('change', () => { c.label = lbl.value.trim().toUpperCase() || c.label; c.touch(); this.ui.store.changed(c); });
    el.querySelectorAll<HTMLElement>('[data-l]').forEach((b) => (b.onclick = () => { c.logo = b.dataset.l as never; c.touch(); this.ui.store.changed(c); this.renderSettings(); }));
    el.querySelectorAll<HTMLElement>('[data-p]').forEach((b) => (b.onclick = () => { c.color = b.dataset.p as never; c.touch(); this.ui.store.changed(c); this.renderSettings(); }));
    el.querySelectorAll<HTMLElement>('[data-pr]').forEach((b) => (b.onclick = () => { c.priority = Number(b.dataset.pr); c.touch(); this.ui.store.changed(c); this.renderSettings(); this.ui.fire('priority', c); }));
    el.querySelectorAll<HTMLButtonElement>('[data-it]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.it as ItemId;
        if (c.allow.includes(id)) { c.allow = c.allow.filter((q) => q !== id); c.deny.push(id); }
        else if (c.deny.includes(id)) c.deny = c.deny.filter((q) => q !== id);
        else c.allow.push(id);
        c.touch(); this.ui.store.changed(c); this.renderSettings(); this.ui.fire('filterset', c);
      };
      b.onpointerenter = (e) => this.ui.tip(`${esc(ITEMS[b.dataset.it!].name)}`, e.clientX, e.clientY);
      b.onpointerleave = () => this.ui.tip(null);
    });
    el.querySelector<HTMLElement>('.link')!.onclick = () => this.linkWorker();
    el.querySelector<HTMLElement>('.more')!.onclick = () => { this.allPicks = !this.allPicks; this.renderSettings(); this.keepOnScreen(); };
    el.querySelectorAll<HTMLElement>('[data-un]').forEach((b) => (b.onclick = () => { const w = crew[Number(b.dataset.un)]; const wk = (this.ui.g.factory as unknown as { workers?: { release(c: unknown): void } }).workers; if (w && wk) wk.release(w.c); this.renderSettings(); }));
  }
  private linkWorker() {
    const wk = (this.ui.g.factory as unknown as { workers?: { list: { c: { dead: boolean; x: number; z: number }; job: string }[]; assign(c: unknown, job: string, t: unknown): string | null } }).workers;
    if (!wk || !this.c.b) { this.flashNote('no workers'); sfx('deny'); return; }
    const b = this.c.b;
    const idle = wk.list.filter((w) => !w.c.dead && w.job === 'idle').sort((a, q) => Math.hypot(a.c.x - b.x, a.c.z - b.z) - Math.hypot(q.c.x - b.x, q.c.z - b.z));
    if (!idle.length) { this.flashNote('all busy'); sfx('deny'); return; }
    const err = wk.assign(idle[0].c, 'haul', b);
    if (err) { this.flashNote(err.toLowerCase()); sfx('deny'); return; }
    sfx('done', 1, 0.5); this.renderSettings();
  }
  frame() {
    this.renderHead();
    if (this.ver !== this.c.ver) { this.ver = this.c.ver; this.renderGrid(); this.renderChips(); this.renderFoot(); if (this.settings) this.renderSettings(); }
    if (this.noteT && performance.now() > this.noteT) { this.note.textContent = ''; this.noteT = 0; }
  }
  cellAt(x: number, y: number): [number, number] | null {
    const r = this.gridEl.getBoundingClientRect();
    if (x < r.left - 4 || y < r.top - 4 || x > r.right + 4 || y > r.bottom + 4) return null;
    const C = CELL * ik();
    return [Math.floor((x - r.left) / C), Math.floor((y - r.top) / C)];
  }
  showDrop(x: number, y: number, w: number, h: number, kind: '' | 'bad' | 'merge') { const C = CELL * ik(); Object.assign(this.drop.style, { display: '', left: x * C + 'px', top: y * C + 'px', width: w * C + 'px', height: h * C + 'px' }); this.drop.className = 'inv-drop ' + kind; }
  hideDrop() { this.drop.style.display = 'none'; }
  liftStack(s: Stack | null) { this.gridEl.querySelectorAll<HTMLDivElement>('.inv-stack').forEach((el) => el.classList.toggle('lift', !!s && this.c.stacks[Number(el.dataset.i)] === s)); }
  get screenEl() { return this.gridEl; }
  dispose() { this.root.remove(); }
}
const fmtKg = (kg: number) => (kg >= 1000 ? (kg / 1000).toFixed(1) + 't' : kg >= 10 ? Math.round(kg) + 'kg' : (Math.round(kg * 10) / 10) + 'kg');
const small = new Map<string, string>();
/** a priority pip: a lit amber lamp in a steel bezel, or dark */
function pipURL(on: boolean) {
  const key = 'pip' + on; let u = small.get(key); if (u) return u;
  const p = new Pen(6, 6), A = RAMPS.glowAmber, S = RAMPS.steel;
  p.rect(0, 0, 6, 6, S[1]); p.rect(1, 1, 4, 4, on ? A[3] : S[2]); if (on) { p.px(1, 1, A[4]); p.px(2, 1, A[4]); } p.hl(1, 4, 4, on ? A[1] : S[1]);
  u = p.url(); small.set(key, u); return u;
}
/** a paint swatch: a daub of the enamel on a steel chip */
function swatchURL(name: keyof typeof RAMPS, on: boolean) {
  const key = 'sw' + name + on; let u = small.get(key); if (u) return u;
  const p = new Pen(14, 14), R = RAMPS[name], S = RAMPS.steel;
  p.rect(0, 0, 14, 14, on ? RAMPS.glowAmber[3] : S[1]); p.rect(2, 2, 10, 10, R[Math.min(R.length - 1, 3)]); p.hl(2, 11, 2, R[R.length - 1]); p.rect(2, 10, 10, 2, R[1]); p.px(3, 3, 0xfff6dc);
  u = p.url(); small.set(key, u); return u;
}
/** a glyph as an img at whole-number scale */
const gimg = (name: string, dark = false) => { const g = GLYPH[name], k = ik(); return `<img class="gl" src="${glyphURL(name, dark)}" style="width:${(g[0].length + 1) * k}px;height:${(g.length + 1) * k}px">`; };
/** a glyph on its own: light ink with a shadow (on the materials), or dark ink with a lit edge (on the paper cards) */
function glyphURL(name: string, dark = false) {
  const key = 'g' + name + dark; let u = small.get(key); if (u) return u;
  const g = GLYPH[name], p = new Pen(g[0].length + 1, g.length + 1); p.glyph(g, 0, 0, dark ? RAMPS.ink[1] : RAMPS.paper[5], dark ? RAMPS.paper[5] : RAMPS.ink[0]);
  u = p.url(); small.set(key, u); return u;
}

// ------------------------------------------------------------------ the manager: up to two panels, the drag, the card
export class InvUI {
  wins: InvWindow[] = [];
  drag: Drag | null = null;
  moved = false;
  private tipEl: HTMLDivElement; private cardEl: HTMLDivElement;
  private handlers: Partial<Record<InvEvent, ((c: Container) => void)[]>> = {};
  private raf = 0;
  constructor(readonly g: Game, readonly store: Storage) {
    injectCrateCSS();
    void loadMats();
    this.tipEl = document.createElement('div'); this.tipEl.className = 'inv-tip'; document.body.appendChild(this.tipEl);
    this.cardEl = document.createElement('div'); this.cardEl.className = 'inv-card'; document.body.appendChild(this.cardEl);
    addEventListener('keydown', (e) => {
      if (!this.wins.length) return;
      if (this.drag && (e.key === 'r' || e.key === 'R')) { this.rotateDrag(); e.stopPropagation(); e.preventDefault(); }
      else if (e.key === 'Escape') { if (this.drag) this.cancelDrag(); else this.close(this.wins[this.wins.length - 1]); e.stopPropagation(); }
    }, true);
    const tick = () => { this.raf = requestAnimationFrame(tick); for (const w of this.wins) w.frame(); };
    tick();
    document.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement)?.closest?.('[data-inv-open]') as HTMLElement | null; if (!b) return;
      const c = store.all().find((q) => q.id === Number(b.dataset.invOpen)); if (c) this.open(c);
    });
  }
  on(ev: InvEvent, f: (c: Container) => void) { (this.handlers[ev] ??= []).push(f); }
  fire(ev: InvEvent, c: Container) { for (const f of this.handlers[ev] ?? []) try { f(c); } catch (e) { console.error(e); } }
  isOpen(c: Container) { return this.wins.some((w) => w.c === c); }
  windowOf(c: Container) { return this.wins.find((w) => w.c === c) ?? null; }
  /** open a container (a second panel goes beside the first; a third replaces the oldest) */
  open(c: Container) {
    const had = this.windowOf(c);
    if (had) { this.front(had); return had; }
    if (this.wins.length >= 2) this.close(this.wins[0], true);
    const w = new InvWindow(this, c);
    this.wins.push(w);
    this.layout();
    sfx('click', 0.7, 0.7);
    this.fire('opened', c);
    return w;
  }
  close(w: InvWindow, quiet = false) {
    const i = this.wins.indexOf(w); if (i < 0) return;
    this.wins.splice(i, 1); w.dispose();
    if (this.drag?.w === w) this.cancelDrag();
    this.card(null);
    if (!quiet) { sfx('click', 0.6, 0.4); this.layout(); }
    this.fire('closed', w.c);
  }
  closeAll() { for (const w of [...this.wins]) this.close(w, true); }
  front(w: InvWindow) { for (const o of this.wins) o.root.style.zIndex = o === w ? '41' : '40'; }
  /** one panel: centred; two: side by side, tops level, an even gap, on the pixel grid */
  layout() {
    if (this.moved && this.wins.length === 1) return;
    const k = ik(), gap = 12 * k;
    const ws = this.wins.map((w) => w.root.getBoundingClientRect());
    const total = ws.reduce((s, r) => s + r.width, 0) + gap * (ws.length - 1);
    let x = Math.max(8, Math.round((innerWidth - total) / 2 / k) * k);
    const tallest = Math.max(...ws.map((r) => r.height));
    const top = Math.max(8, Math.round(((innerHeight - tallest) / 2 - 40) / k) * k);
    this.wins.forEach((w, i) => { w.root.style.left = x + 'px'; w.root.style.top = top + 'px'; x += Math.round(ws[i].width) + gap; });
    this.moved = false;
  }
  // ---------------------------------------------------------------- a one-line tip, and the item card
  tip(text: string | null, x = 0, y = 0) {
    if (!text) { this.tipEl.style.display = 'none'; return; }
    this.tipEl.textContent = text; this.tipEl.style.display = 'block';
    const k = ik(), r = this.tipEl.getBoundingClientRect(), w = Math.ceil(r.width / k), h = Math.ceil(r.height / k);
    Object.assign(this.tipEl.style, { width: w * k + 'px', height: h * k + 'px', backgroundImage: `url(${cardURL(w, h, 3)})`, backgroundSize: `${w * k}px ${h * k}px` });
    this.tipMove(x, y);
  }
  tipMove(x: number, y: number) { const r = this.tipEl.getBoundingClientRect(); this.tipEl.style.left = Math.round(Math.min(innerWidth - r.width - 6, x + 16)) + 'px'; this.tipEl.style.top = Math.round(Math.min(innerHeight - r.height - 6, y + 14)) + 'px'; }
  /** an item hovered: the card with the item larger, its name and its numbers */
  card(w: InvWindow | null, s?: Stack, x = 0, y = 0) {
    if (!w || !s) { this.cardEl.style.display = 'none'; return; }
    const d = itemDef(s.item), p = d.perish, keep = w.c.keeps(s.item), k = ik();
    const g = (n: string) => gimg(n, true);
    let spoil = '';
    if (p) { const days = s.fresh * p.days; spoil = `<span class="${keep ? 'ok' : s.fresh < 0.3 ? 'r' : ''}">${g('clock')}${keep ? 'cold' : days < 1 ? Math.max(1, Math.round((days * DAY) / 60)) + 'm' : days.toFixed(1) + 'd'}</span>`; }
    this.cardEl.innerHTML = `<img class="big" src="${itemIcon(s.item, 96)}"><div class="txt"><div class="nm inv-t">${esc(d.name)}</div>` +
      `<div class="nums"><span>${g('size')}${d.size[0]}×${d.size[1]}</span><span>${g('stack')}${s.n}/${d.stack}</span>${spoil}<span>${g('mass')}${fmtKg(d.mass * s.n)}</span></div></div>`;
    this.cardEl.style.display = 'block';
    const W = 176, H = 58;
    Object.assign(this.cardEl.style, { width: W * k + 'px', height: H * k + 'px', backgroundImage: `url(${cardURL(W, H, 5)})`, backgroundSize: `${W * k}px ${H * k}px` });
    this.cardMove(x, y);
  }
  cardMove(x: number, y: number) { const r = this.cardEl.getBoundingClientRect(), k = ik(); this.cardEl.style.left = Math.round(Math.min(innerWidth - r.width - 8, x + 20) / k) * k + 'px'; this.cardEl.style.top = Math.round(Math.max(8, Math.min(innerHeight - r.height - 8, y + 16)) / k) * k + 'px'; }
  // ---------------------------------------------------------------- drag and drop
  startDrag(w: InvWindow, s: Stack, n: number, gx: number, gy: number, e: PointerEvent) {
    this.card(null);
    const ghost = document.createElement('div'); ghost.className = 'inv-ghost';
    document.body.appendChild(ghost);
    this.drag = { w, s, n, rot: s.rot, gx, gy, ghost, moved: false, sx: e.clientX, sy: e.clientY };
    this.paintGhost();
    this.moveDrag(e.clientX, e.clientY);
    const mv = (ev: PointerEvent) => this.moveDrag(ev.clientX, ev.clientY);
    const ctx = (ev: MouseEvent) => { ev.preventDefault(); this.rotateDrag(); };
    const up = (ev: PointerEvent) => { if (ev.button === 2) return; removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('contextmenu', ctx, true); this.endDrag(ev.clientX, ev.clientY); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('contextmenu', ctx, true);
    w.liftStack(s);
  }
  private paintGhost() {
    const d = this.drag!, [w, h] = d.w.c.dims(d.s.item, d.rot), C = CELL * ik(), sp = 32 * ik(), sz = itemDef(d.s.item).size, turned = d.rot && sz[0] !== sz[1];
    d.ghost.style.width = w * C + 'px'; d.ghost.style.height = h * C + 'px';
    d.ghost.innerHTML = `<img src="${itemIcon(d.s.item, 64)}" style="left:${(w * C - sp) / 2}px;top:${(h * C - sp) / 2}px;width:${sp}px;height:${sp}px;${turned ? 'transform:rotate(90deg)' : ''}">${d.n > 1 ? `<span class="cnt">${d.n}</span>` : ''}`;
  }
  private rotateDrag() { const d = this.drag; if (!d) return; const sz = itemDef(d.s.item).size; if (sz[0] === sz[1]) return; d.rot = d.rot ? 0 : 1; [d.gx, d.gy] = [d.gy, d.gx]; this.paintGhost(); sfx('click', 1.4, 0.4); }
  private target(x: number, y: number): { w: InvWindow; cx: number; cy: number } | null {
    for (const w of [...this.wins].reverse()) { const at = w.cellAt(x, y); if (at) return { w, cx: at[0], cy: at[1] }; }
    return null;
  }
  private moveDrag(x: number, y: number) {
    const d = this.drag; if (!d) return;
    if (Math.hypot(x - d.sx, y - d.sy) > 4) d.moved = true;
    const C = CELL * ik();
    d.ghost.style.left = Math.round(x - d.gx * C - C / 2) + 'px'; d.ghost.style.top = Math.round(y - d.gy * C - C / 2) + 'px';
    for (const w of this.wins) w.hideDrop();
    const t = this.target(x, y); if (!t) return;
    const [w, h] = t.w.c.dims(d.s.item, d.rot), px = t.cx - d.gx, py = t.cy - d.gy;
    const o = t.w.c.occ(t.w.c === d.w.c ? d.s : undefined), under = t.cx >= 0 && t.cy >= 0 && t.cx < t.w.c.W && t.cy < t.w.c.H ? t.w.c.stacks[o[t.cy * t.w.c.W + t.cx]] : undefined;
    if (under && under.item === d.s.item && under !== d.s) { const [uw, uh] = t.w.c.dims(under.item, under.rot); t.w.showDrop(under.x, under.y, uw, uh, 'merge'); return; }
    const ok = t.w.c.takesKind(d.s.item) && (t.w.c === d.w.c || t.w.c.passes(d.s.item)) && t.w.c.fits(d.s.item, px, py, d.rot, t.w.c === d.w.c ? d.s : undefined);
    t.w.showDrop(Math.max(0, Math.min(t.w.c.W - w, px)), Math.max(0, Math.min(t.w.c.H - h, py)), w, h, ok ? '' : 'bad');
  }
  private endDrag(x: number, y: number) {
    const d = this.drag; if (!d) return;
    this.drag = null; d.ghost.remove();
    for (const w of this.wins) { w.hideDrop(); w.liftStack(null); }
    if (!d.moved) return;
    const t = this.target(x, y); if (!t) return;
    const px = t.cx - d.gx, py = t.cy - d.gy, src = d.w.c, dst = t.w.c, st = this.store;
    if (dst === src) {
      const o = src.occ(d.s), under = t.cx >= 0 && t.cy >= 0 && t.cx < src.W && t.cy < src.H ? src.stacks[o[t.cy * src.W + t.cx]] : undefined;
      if (d.n < d.s.n) {
        const k = d.n;
        if (under && under.item === d.s.item) { const lim = itemDef(d.s.item).stack, m = Math.min(k, lim - under.n); if (m > 0) { under.n += m; d.s.n -= m; src.touch(); st.changed(src); this.fire('merged', src); } return; }
        if (!src.fits(d.s.item, px, py, d.rot)) { t.w.flashNote('no room'); sfx('deny'); return; }
        d.s.n -= k; src.stacks.push({ item: d.s.item, n: k, x: px, y: py, rot: d.rot, fresh: d.s.fresh }); src.touch(); st.changed(src); this.fire('split', src); sfx('click', 0.9, 0.5);
        return;
      }
      const merging = under && under.item === d.s.item && under !== d.s;
      if (src.place(d.s, merging ? t.cx : px, merging ? t.cy : py, d.rot)) { sfx('click', 0.9, 0.5); st.changed(src); this.fire(merging ? 'merged' : 'moved', src); }
      else { t.w.flashNote('no room'); sfx('deny'); }
      return;
    }
    const why = dst.why(d.s.item);
    if (why) { t.w.flashNote(dst.passes(d.s.item) ? 'won\'t take it' : 'filtered out'); sfx('deny'); return; }
    const got = st.transfer(src, d.s, d.n, dst, px, py, d.rot);
    if (got <= 0) { t.w.flashNote('full'); sfx('deny'); return; }
    if (got < d.n) t.w.flashNote(`${got} fit`);
    sfx('click', 0.8, 0.6); this.fire('moved', dst);
  }
  cancelDrag() { const d = this.drag; if (!d) return; this.drag = null; d.ghost.remove(); for (const w of this.wins) { w.hideDrop(); w.liftStack(null); } }
  /** double-click: the whole stack to the other open panel */
  quickMove(w: InvWindow, s: Stack) {
    const other = this.wins.find((o) => o !== w);
    if (!other) return;
    if (other.c.why(s.item)) { other.flashNote('won\'t take it'); sfx('deny'); return; }
    const got = this.store.move(w.c, other.c, s.item, s.n);
    if (got) { sfx('click', 0.8, 0.6); this.fire('moved', other.c); } else { other.flashNote('full'); sfx('deny'); }
  }
  dispose() { cancelAnimationFrame(this.raf); this.closeAll(); this.tipEl.remove(); this.cardEl.remove(); }
}

let UI: InvUI | null = null;
/** the inventory UI for a game (created on first use) */
export function invUI(g: Game): InvUI | null {
  const st = (g as unknown as { storage?: Storage }).storage; if (!st) return null;
  if (!UI || UI.g !== g) { UI?.dispose(); UI = new InvUI(g, st); st.onOpen = (c) => UI!.open(c); }
  return UI;
}
/** open a container's panel */
export function openInventory(g: Game, c: Container) { return invUI(g)?.open(c) ?? null; }
