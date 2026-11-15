// A container, opened. Its window is a sheet of paper pinned over the world with a live 3D diorama on it: the real
// container (opened; closed kinds cut away) on a block of earth, and its contents as real 3D items standing in the
// cells of its own interior (the grid is chalked on its floor). Drag an item out and drop it into another cell, onto
// its twin to merge, or into the other open container (the two sheets sit side by side); R or right-click while
// dragging turns a long item; right-click splits a stack, shift-drag carries half, double-click sends it across.
// SORT is a row of paper tabs, FILTER a row of rubber stamps (one per kind of thing) and a pencilled search line.
// Hovering an item turns it on a little plinth with inked callouts. The gear opens the settings tag: label, logo
// stamp, paint, priority pins, allow and deny stamps, and the workers linked to it.
import type { Game } from '../../game/game';
import { ITEMS, ITEM_IDS, ITEM_GROUPS, itemDef, itemIcon, type ItemId, type ItemGroup } from '../../factory/items';
import type { Container, Stack, SortKey } from '../../inv/container';
import type { Storage } from '../../inv/storage';
import { DAY } from '../../inv/storage';
import { KIND_INFO, PAINTS, PAINT_IDS, LOGO_IDS } from '../../inv/kinds';
import { drawLogoBadge } from '../../inv/tex';
import { logoURL, LOGO_NAME } from '../../inv/logos';
import { injectCrateCSS } from './style';
import { cardURL, stampURL, pinURL, leaderPath, INK_HEX } from './ink';
import { overlay, ContainerView, PlinthView } from './vignette';
import { sfx } from '../../audio/audio';

const SORTS: { k: SortKey; name: string }[] = [{ k: 'type', name: 'TYPE' }, { k: 'name', name: 'A-Z' }, { k: 'count', name: 'COUNT' }, { k: 'value', name: 'VALUE' }, { k: 'fresh', name: 'FRESH' }];
/** the item each kind of thing is stamped with */
const GROUP_ICON: Record<ItemGroup, ItemId> = { bio: 'wood', seed: 'seed_tree', specimen: 'tissue', earth: 'soil', mineral: 'crystal', fluid: 'water', refined: 'iron_ingot', part: 'gear' };
const ik = () => (innerHeight >= 1000 ? 2 : 1);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const hexs = (c: number) => '#' + c.toString(16).padStart(6, '0');
export type InvEvent = 'opened' | 'sorted' | 'filtered' | 'split' | 'moved' | 'merged' | 'settings' | 'priority' | 'filterset' | 'closed';

interface Drag { w: InvWindow; s: Stack; n: number; rot: 0 | 1; gx: number; gy: number; ghost: HTMLElement; moved: boolean; sx: number; sy: number }

class InvWindow {
  readonly root: HTMLDivElement;
  private plate: HTMLCanvasElement;
  private screen: HTMLDivElement; private tags: HTMLDivElement;
  private chips: HTMLDivElement; private foot: HTMLDivElement; private note: HTMLDivElement; setEl: HTMLDivElement;
  private search: HTMLInputElement;
  readonly view: ContainerView;
  private ver = -1; private look = '';
  group: ItemGroup | null = null; query = '';
  sortKey: SortKey | null = null;
  settings = false;
  constructor(readonly ui: InvUI, readonly c: Container) {
    const r = (this.root = document.createElement('div'));
    r.className = 'inv-win pop';
    r.innerHTML = `
      <div class="inv-bar srt"></div>
      <div class="inv-head"><canvas class="plate" width="24" height="24"></canvas>
        <div class="inv-title"><div class="lab inv-t"></div><div class="kind"></div></div>
        <div class="inv-pri" title="Priority: higher fills first"></div>
        <button class="inv-ink gear" title="Settings: label, logo, paint, priority, filters, workers">${GEAR}</button>
        <button class="inv-ink x" title="Close (Esc)">${CROSS}</button></div>
      <div class="inv-bar flt"><div class="inv-search"><span class="pencil">${PENCIL}</span><input type="text" placeholder="search" spellcheck="false"></div></div>
      <div class="inv-bar chips"></div>
      <div class="inv-screen"></div>
      <div class="inv-foot"></div><div class="inv-note"></div><div class="inv-set" style="display:none"></div>`;
    this.plate = r.querySelector('canvas.plate')!;
    this.screen = r.querySelector('.inv-screen')!;
    this.chips = r.querySelector('.chips')!; this.foot = r.querySelector('.inv-foot')!; this.note = r.querySelector('.inv-note')!; this.setEl = r.querySelector('.inv-set')!;
    this.search = r.querySelector('input')!;
    this.tags = document.createElement('div'); this.tags.className = 'inv-tags'; document.body.appendChild(this.tags);
    const srt = r.querySelector('.srt')!;
    for (const s of SORTS) {
      const b = document.createElement('button'); b.className = 'inv-tab'; b.textContent = s.name; b.dataset.sort = s.k;
      b.title = `Sort by ${s.k} (again to reverse)`;
      b.onclick = () => this.doSort(s.k);
      srt.appendChild(b);
    }
    r.querySelector<HTMLButtonElement>('.x')!.onclick = () => ui.close(this);
    r.querySelector<HTMLButtonElement>('.gear')!.onclick = () => { this.settings = !this.settings; this.renderSettings(); this.keepOnScreen(); sfx('click', 1, 0.5); if (this.settings) ui.fire('settings', this.c); };
    this.search.addEventListener('input', () => { this.query = this.search.value.trim().toLowerCase(); this.applyFilter(); if (this.query) ui.fire('filtered', this.c); });
    this.search.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { this.search.value = ''; this.query = ''; this.applyFilter(); this.search.blur(); } });
    // the sheet drags by its head
    const head = r.querySelector<HTMLDivElement>('.inv-head')!;
    head.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const x0 = e.clientX - r.offsetLeft, y0 = e.clientY - r.offsetTop;
      const mv = (ev: PointerEvent) => { r.style.left = Math.max(0, Math.min(innerWidth - 80, ev.clientX - x0)) + 'px'; r.style.top = Math.max(0, Math.min(innerHeight - 60, ev.clientY - y0)) + 'px'; this.ui.moved = true; };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    r.addEventListener('pointerdown', () => ui.front(this));
    r.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    r.addEventListener('contextmenu', (e) => e.preventDefault());
    // the diorama: pick items on it
    const sc = this.screen;
    sc.addEventListener('pointerdown', (e) => {
      if (this.ui.drag) return;
      const s = this.view.stackAt(e.clientX, e.clientY); if (!s) return;
      if (e.button === 2) { e.preventDefault(); this.splitHalf(s); return; }
      if (e.button !== 0) return;
      e.preventDefault();
      this.ui.startDrag(this, s, e.shiftKey && s.n > 1 ? Math.ceil(s.n / 2) : s.n, 0, 0, e);
    });
    sc.addEventListener('dblclick', (e) => { const s = this.view.stackAt(e.clientX, e.clientY); if (s) this.ui.quickMove(this, s); });
    sc.addEventListener('pointermove', (e) => {
      if (this.ui.drag) return;
      const s = this.view.stackAt(e.clientX, e.clientY);
      if (s !== this.view.hover) { this.view.hover = s; if (s) this.ui.plinth(this, s, e.clientX, e.clientY); else this.ui.plinth(null); }
      else if (s) this.ui.plinthMove(e.clientX, e.clientY);
    });
    sc.addEventListener('pointerleave', () => { this.view.hover = null; this.ui.plinth(null); });
    document.body.appendChild(r);
    setTimeout(() => r.classList.remove('pop'), 300);
    this.view = new ContainerView(sc, c);
    overlay().add(this.view);
    this.frame();
  }
  /** a sheet that grew (the settings tag) slides up to stay on screen */
  keepOnScreen() {
    const r = this.root.getBoundingClientRect();
    if (r.bottom > innerHeight - 8) this.root.style.top = Math.max(8, innerHeight - 8 - r.height) + 'px';
  }
  /** the logo stamp, the label in ink, the priority pins */
  private renderHead() {
    const look = `${this.c.logo}|${this.c.color}|${this.c.label}|${this.c.priority}`;
    if (look === this.look) return;
    this.look = look;
    drawLogoBadge(this.plate.getContext('2d')!, this.c.logo, this.c.color, 24, 24);
    this.root.querySelector('.lab')!.textContent = this.c.label;
    const I = KIND_INFO[this.c.kind];
    this.root.querySelector('.kind')!.textContent = `${I.name.toLowerCase()} ${this.c.W}×${this.c.H}`;
    const pri = this.root.querySelector<HTMLDivElement>('.inv-pri')!;
    pri.innerHTML = this.c.kind === 'hold' ? '' : [1, 2, 3, 4, 5].map((k) => `<img src="${pinURL(k <= this.c.priority)}">`).join('');
    (this.root.querySelector('.gear') as HTMLElement).style.display = this.c.kind === 'hold' ? 'none' : '';
  }
  /** the kinds of thing in here as rubber stamps (the item that stands for each, its count) */
  private renderChips() {
    const by = new Map<ItemGroup, number>();
    for (const s of this.c.stacks) { const g = itemDef(s.item).group; by.set(g, (by.get(g) ?? 0) + s.n); }
    const k = ik(), S = 22 * k;
    const stamp = (on: boolean, inner: string, n: number, g: string, title: string) => `<button class="inv-stamp ${on ? 'on' : ''}" data-g="${g}" title="${title}" style="background-image:url(${stampURL(S, true, on ? 'red' : 'ink', g.length + 3, on)})">${inner}<span class="n">${n}</span></button>`;
    this.chips.innerHTML = stamp(!this.group, `<span class="all">*</span>`, this.c.count(), '', 'Everything') +
      ITEM_GROUPS.filter((g) => by.get(g.k) || this.group === g.k).map((g) => stamp(this.group === g.k, `<img src="${itemIcon(GROUP_ICON[g.k], 32)}">`, by.get(g.k) ?? 0, g.k, `Only ${g.name.toLowerCase()}`)).join('');
    this.chips.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => { this.group = (b.dataset.g || null) as ItemGroup | null; sfx('click', 1.2, 0.4); this.renderChips(); this.applyFilter(); this.ui.fire('filtered', this.c); }));
  }
  private matches(s: Stack) {
    const d = itemDef(s.item);
    if (this.group && d.group !== this.group) return false;
    if (this.query && !(d.name.toLowerCase().includes(this.query) || d.group.includes(this.query) || d.tags.some((t) => t.includes(this.query)))) return false;
    return true;
  }
  /** what matches lights (its tag goes red), the rest fades */
  applyFilter() { this.tagKey = ''; }
  private tagKey = '';
  /** the count tags hang by each stack in the diorama (screen-projected every frame) */
  private renderTags() {
    const any = !!this.group || !!this.query, v = this.view;
    const key = v.slots.map((q) => q.s.n + q.s.item).join(',') + any + this.group + this.query + v.lifted?.item;
    if (key !== this.tagKey) {
      this.tagKey = key;
      this.tags.innerHTML = v.slots.map((q, i) => { const m = this.matches(q.s), p = itemDef(q.s.item).perish; return `<div class="inv-ctag ${any ? (m ? 'hit' : 'dim') : ''} ${p && !this.c.keeps(q.s.item) && q.s.fresh < 0.4 ? 'rot' : ''}" data-i="${i}">${q.s.n}</div>`; }).join('');
    }
    const r = this.screen.getBoundingClientRect();
    this.tags.querySelectorAll<HTMLDivElement>('.inv-ctag').forEach((el) => {
      const q = v.slots[Number(el.dataset.i)]; if (!q) return;
      const [x, y] = v.screen(q.top);
      const vis = q.s !== v.lifted && x > r.left && x < r.right && y > r.top && y < r.bottom;
      el.style.display = vis ? '' : 'none';
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    });
  }
  splitHalf(s: Stack) {
    if (s.n < 2) { this.flashNote('one item: nothing to split'); return; }
    const ns = this.c.split(s, Math.floor(s.n / 2));
    if (!ns) { this.flashNote('no free cell to split into'); sfx('deny'); return; }
    sfx('click', 0.8, 0.6); this.ui.store.changed(this.c); this.ui.fire('split', this.c);
  }
  private renderFoot() {
    const used = this.c.fill(), mass = this.c.stacks.reduce((m, s) => m + itemDef(s.item).mass * s.n, 0);
    const cells = Math.round(used * this.c.W * this.c.H);
    const pw = KIND_INFO[this.c.kind].power ? (this.c.powered() ? ' powered' : ' <b class="r">no power</b>') : '';
    this.foot.innerHTML = `<span>${cells}/${this.c.W * this.c.H}</span><div class="inv-meter ${used > 0.9 ? 'full' : ''}"><b style="width:${Math.round(used * 100)}%"></b></div><span>${fmtKg(mass)}${pw}</span>`;
  }
  private noteT = 0;
  flashNote(s: string) { this.note.textContent = s; this.noteT = performance.now() + 2600; }
  doSort(k: SortKey) {
    const desc = this.sortKey === k;
    this.c.sort(k, desc); this.sortKey = desc ? null : k;
    this.root.querySelectorAll<HTMLButtonElement>('.srt button').forEach((b) => b.classList.toggle('act', b.dataset.sort === k));
    sfx('click', 0.9, 0.6); this.ui.store.changed(this.c); this.ui.fire('sorted', this.c);
  }
  /** the paper sheet's ink frame and tape, at its exact size */
  paint() {
    const k = ik(), b = this.root.getBoundingClientRect(), w = Math.round(b.width), h = Math.round(b.height);
    const key = `${w}x${h}`;
    if (this.root.dataset.bg !== key) { this.root.dataset.bg = key; this.root.style.backgroundImage = `url(${cardURL(w, h, k, this.c.id, { paper: true, pin: true })})`; }
    if (this.settings) { const s = this.setEl.getBoundingClientRect(), sk = `${Math.round(s.width)}x${Math.round(s.height)}`; if (this.setEl.dataset.bg !== sk) { this.setEl.dataset.bg = sk; this.setEl.style.backgroundImage = `url(${cardURL(Math.round(s.width), Math.round(s.height), k, this.c.id + 7, { paper: true, tape: true })})`; } }
  }
  // ---------------------------------------------------------------- the settings tag
  renderSettings() {
    const c = this.c, el = this.setEl, k = ik();
    this.root.querySelector('.gear')!.classList.toggle('act', this.settings);
    el.style.display = this.settings ? '' : 'none';
    requestAnimationFrame(() => this.paint());
    if (!this.settings) return;
    const takes = ITEM_IDS.filter((id) => ITEMS[id].cat !== 'internal' && c.takesKind(id));
    const crew = this.ui.store.linked(c);
    el.innerHTML = `
      <span class="k">name</span><div><input class="lbl" maxlength="10" value="${esc(c.label)}"></div>
      <span class="k">logo</span><div class="inv-logos">${LOGO_IDS.map((l) => `<button data-l="${l}" class="${c.logo === l ? 'on' : ''}" title="${LOGO_NAME[l]}"><img src="${logoURL(l, c.logo === l ? '#8c2920' : INK_HEX, k)}"></button>`).join('')}</div>
      <span class="k">paint</span><div class="inv-paints">${PAINT_IDS.map((p) => `<button data-p="${p}" class="${c.color === p ? 'on' : ''}" title="${PAINTS[p].name}"><i style="background:${hexs(PAINTS[p].base)}"></i></button>`).join('')}</div>
      <span class="k">priority</span><div class="inv-pins">${[1, 2, 3, 4, 5].map((q) => `<button data-pr="${q}" title="${q >= 4 ? 'fills first' : q <= 2 ? 'takes the overflow' : 'normal'}"><img src="${pinURL(q <= c.priority)}"></button>`).join('')}<span class="hint">${c.priority >= 4 ? 'fills first' : c.priority <= 2 ? 'overflow' : 'normal'}</span></div>
      <span class="k">takes</span><div><div class="inv-picks">${takes.map((id) => `<button data-it="${id}" class="${c.allow.includes(id) ? 'allow' : c.deny.includes(id) ? 'deny' : ''}" title="${esc(ITEMS[id].name)}"><img src="${itemIcon(id, 32)}"></button>`).join('')}</div>
        <div class="hint">click: only these · again: never · again: clear${c.allow.length || c.deny.length ? ` · <u class="clr">clear all</u>` : ''}</div></div>
      <span class="k">crew</span><div class="inv-crew">${crew.map((w, i) => `<span class="w">${esc(w.c.sp.name)} <b data-un="${i}" title="Unlink">×</b></span>`).join('')}<button class="inv-ink w link" title="Link the nearest idle worker: it keeps this stocked">+ link worker</button></div>`;
    const lbl = el.querySelector<HTMLInputElement>('input.lbl')!;
    lbl.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') lbl.blur(); });
    lbl.addEventListener('change', () => { c.label = lbl.value.trim().toUpperCase() || c.label; c.touch(); this.ui.store.changed(c); });
    el.querySelectorAll<HTMLButtonElement>('[data-l]').forEach((b) => (b.onclick = () => { c.logo = b.dataset.l as never; c.touch(); this.ui.store.changed(c); this.renderSettings(); }));
    el.querySelectorAll<HTMLButtonElement>('[data-p]').forEach((b) => (b.onclick = () => { c.color = b.dataset.p as never; c.touch(); this.ui.store.changed(c); this.renderSettings(); }));
    el.querySelectorAll<HTMLButtonElement>('[data-pr]').forEach((b) => (b.onclick = () => { c.priority = Number(b.dataset.pr); c.touch(); this.ui.store.changed(c); this.renderSettings(); this.ui.fire('priority', c); }));
    el.querySelectorAll<HTMLButtonElement>('[data-it]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.it as ItemId;
        if (c.allow.includes(id)) { c.allow = c.allow.filter((q) => q !== id); c.deny.push(id); }
        else if (c.deny.includes(id)) c.deny = c.deny.filter((q) => q !== id);
        else c.allow.push(id);
        c.touch(); this.ui.store.changed(c); this.renderSettings(); this.ui.fire('filterset', c);
      };
    });
    el.querySelector<HTMLElement>('.clr')?.addEventListener('click', () => { c.allow = []; c.deny = []; c.touch(); this.ui.store.changed(c); this.renderSettings(); });
    el.querySelector<HTMLButtonElement>('.link')!.onclick = () => this.linkWorker();
    el.querySelectorAll<HTMLElement>('[data-un]').forEach((b) => (b.onclick = () => { const w = crew[Number(b.dataset.un)]; const wk = (this.ui.g.factory as unknown as { workers?: { release(c: unknown): void } }).workers; if (w && wk) wk.release(w.c); this.renderSettings(); }));
  }
  private linkWorker() {
    const wk = (this.ui.g.factory as unknown as { workers?: { list: { c: { dead: boolean; x: number; z: number }; job: string }[]; assign(c: unknown, job: string, t: unknown): string | null } }).workers;
    if (!wk || !this.c.b) { this.flashNote('no workers yet: convert or print a creature'); sfx('deny'); return; }
    const b = this.c.b;
    const idle = wk.list.filter((w) => !w.c.dead && w.job === 'idle').sort((a, q) => Math.hypot(a.c.x - b.x, a.c.z - b.z) - Math.hypot(q.c.x - b.x, q.c.z - b.z));
    if (!idle.length) { this.flashNote('every worker is busy'); sfx('deny'); return; }
    const err = wk.assign(idle[0].c, 'haul', b);
    if (err) { this.flashNote(err); sfx('deny'); return; }
    sfx('done', 1, 0.5); this.renderSettings();
  }
  /** keep in step with the container */
  frame() {
    this.renderHead();
    if (this.ver !== this.c.ver) { this.ver = this.c.ver; this.renderChips(); this.renderFoot(); if (this.settings) this.renderSettings(); }
    this.renderTags();
    this.paint();
    if (this.noteT && performance.now() > this.noteT) { this.note.textContent = ''; this.noteT = 0; }
  }
  cellAt(x: number, y: number): [number, number] | null { return this.view.cellAt(x, y); }
  showDrop(x: number, y: number, w: number, h: number, kind: '' | 'bad' | 'merge') { this.view.showDrop(x, y, w, h, kind); }
  hideDrop() { this.view.hideDrop(); }
  liftStack(s: Stack | null) { this.view.lifted = s; this.tagKey = ''; }
  get screenEl() { return this.screen; }
  dispose() { overlay().remove(this.view); this.view.dispose(); this.tags.remove(); this.root.remove(); }
}
const fmtKg = (kg: number) => (kg >= 1000 ? (kg / 1000).toFixed(1) + ' t' : kg >= 10 ? Math.round(kg) + ' kg' : (Math.round(kg * 10) / 10) + ' kg');
const GEAR = `<svg viewBox="0 0 12 12" shape-rendering="crispEdges"><path fill="currentColor" d="M5 0h2v2h1V1h1v1h1v1H9v1h2v1h1v2h-1v1H9v1h1v1H9v1H8v-1H7v2H5v-2H4v1H3v-1H2V9h1V8H1V7H0V5h1V4h2V3H2V2h1V1h1v1h1zM5 4v1H4v2h1v1h2V7h1V5H7V4z"/></svg>`;
const CROSS = `<svg viewBox="0 0 12 12" shape-rendering="crispEdges"><path fill="currentColor" d="M1 1h2v1h1v1h1v1h2V3h1V2h1V1h2v2h-1v1H9v1H8v2h1v1h1v1h1v2H9v-1H8V9H7V8H5v1H4v1H3v1H1V9h1V8h1V7h1V5H3V4H2V3H1z"/></svg>`;
const PENCIL = `<svg viewBox="0 0 12 12" shape-rendering="crispEdges"><path fill="currentColor" d="M9 0h1v1h1v1h1v1h-1v1h-1v1H9v1H8v1H7v1H6v1H5v1H4v1H3v1H0V9h1V8h1V7h1V6h1V5h1V4h1V3h1V2h1V1h1zM1 9v2h2v-1H2V9z"/></svg>`;
// ------------------------------------------------------------------ the manager: up to two sheets, the drag, the plinth
export class InvUI {
  wins: InvWindow[] = [];
  drag: Drag | null = null;
  moved = false;
  private tipEl: HTMLDivElement;
  private plinthEl: HTMLDivElement; private plinthView: PlinthView; private plinthOn = false;
  private handlers: Partial<Record<InvEvent, ((c: Container) => void)[]>> = {};
  private raf = 0;
  constructor(readonly g: Game, readonly store: Storage) {
    injectCrateCSS();
    this.tipEl = document.createElement('div'); this.tipEl.className = 'inv-tip'; document.body.appendChild(this.tipEl);
    this.plinthEl = document.createElement('div'); this.plinthEl.className = 'inv-plinth';
    this.plinthEl.innerHTML = `<div class="stage"></div><svg class="lead"></svg><div class="calls"></div>`;
    document.body.appendChild(this.plinthEl);
    this.plinthView = new PlinthView(this.plinthEl.querySelector('.stage')!);
    addEventListener('keydown', (e) => {
      if (!this.wins.length) return;
      if (this.drag && (e.key === 'r' || e.key === 'R')) { this.rotateDrag(); e.stopPropagation(); e.preventDefault(); }
      else if (e.key === 'Escape') { if (this.drag) this.cancelDrag(); else this.close(this.wins[this.wins.length - 1]); e.stopPropagation(); }
    }, true);
    let last = performance.now();
    const tick = () => { this.raf = requestAnimationFrame(tick); const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; for (const w of this.wins) w.frame(); if (this.plinthOn) { this.plinthView.render(dt); this.leaders(); } };
    tick();
    // a button in the works inspector opens the window
    document.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement)?.closest?.('[data-inv-open]') as HTMLElement | null; if (!b) return;
      const c = store.all().find((q) => q.id === Number(b.dataset.invOpen)); if (c) this.open(c);
    });
  }
  on(ev: InvEvent, f: (c: Container) => void) { (this.handlers[ev] ??= []).push(f); }
  fire(ev: InvEvent, c: Container) { for (const f of this.handlers[ev] ?? []) try { f(c); } catch (e) { console.error(e); } }
  isOpen(c: Container) { return this.wins.some((w) => w.c === c); }
  windowOf(c: Container) { return this.wins.find((w) => w.c === c) ?? null; }
  /** open a container (a second sheet goes beside the first; a third replaces the oldest) */
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
    this.plinth(null);
    if (!quiet) { sfx('click', 0.6, 0.4); this.layout(); }
    this.fire('closed', w.c);
  }
  closeAll() { for (const w of [...this.wins]) this.close(w, true); }
  front(w: InvWindow) { for (const o of this.wins) o.root.style.zIndex = o === w ? '40' : '39'; }
  /** one sheet: centred; two: side by side, their tops level */
  layout() {
    if (this.moved && this.wins.length === 1) return;
    const gap = 14 * ik();
    const ws = this.wins.map((w) => w.root.getBoundingClientRect());
    const total = ws.reduce((s, r) => s + r.width, 0) + gap * (ws.length - 1);
    let x = Math.max(8, (innerWidth - total) / 2);
    const tallest = Math.max(...ws.map((r) => r.height));
    const top = Math.round(Math.max(8, (innerHeight - tallest) / 2 - 40));
    this.wins.forEach((w, i) => { w.root.style.left = Math.round(x) + 'px'; w.root.style.top = top + 'px'; x += ws[i].width + gap; });
    this.moved = false;
  }
  // ---------------------------------------------------------------- a note (plain) and the plinth (an item)
  tip(html: string | null, x = 0, y = 0) {
    if (!html) { this.tipEl.style.display = 'none'; return; }
    this.tipEl.innerHTML = html.replace('<h4>', '<h4 class="inv-t">'); this.tipEl.style.display = 'block';
    const r = this.tipEl.getBoundingClientRect();
    this.tipEl.style.backgroundImage = `url(${cardURL(Math.round(r.width), Math.round(r.height), ik(), 5, { paper: true, tape: false })})`;
    this.tipMove(x, y);
  }
  tipMove(x: number, y: number) { const r = this.tipEl.getBoundingClientRect(); this.tipEl.style.left = Math.min(innerWidth - r.width - 6, x + 16) + 'px'; this.tipEl.style.top = Math.min(innerHeight - r.height - 6, y + 14) + 'px'; }
  /** an item hovered in a diorama: it turns on a plinth, inked callouts point at it */
  plinth(w: InvWindow | null, s?: Stack, x = 0, y = 0) {
    if (!w || !s) { if (this.plinthOn) { this.plinthOn = false; this.plinthEl.style.display = 'none'; } return; }
    const d = itemDef(s.item), p = d.perish, keep = w.c.keeps(s.item);
    let fresh = '';
    if (p) { const days = s.fresh * p.days; fresh = keep ? `<div class="g">kept fresh in here</div>` : `<div class="${s.fresh < 0.3 ? 'r' : 'w'}">${Math.round(s.fresh * 100)}% fresh · ${days < 1 ? Math.max(1, Math.round((days * DAY) / 60)) + ' min' : days.toFixed(1) + ' days'} left</div>`; }
    this.plinthEl.querySelector('.calls')!.innerHTML =
      `<div class="c0"><h4 class="inv-t">${esc(d.name)}</h4><span class="g">${d.group}</span></div>` +
      `<div class="c1"><b>${s.n}</b><span class="g"> / ${d.stack}</span><br><span class="g">${d.size[0]}×${d.size[1]} cells</span></div>` +
      `<div class="c2">${fmtKg(d.mass * s.n)}${fresh}</div>`;
    this.plinthView.set(s.item);
    this.plinthEl.style.display = 'block';
    const r = this.plinthEl.getBoundingClientRect();
    this.plinthEl.style.backgroundImage = `url(${cardURL(Math.round(r.width), Math.round(r.height), ik(), 9, { paper: true, tape: true })})`;
    this.plinthOn = true;
    this.plinthMove(x, y);
  }
  plinthMove(x: number, y: number) {
    const r = this.plinthEl.getBoundingClientRect();
    this.plinthEl.style.left = Math.min(innerWidth - r.width - 8, x + 24) + 'px';
    this.plinthEl.style.top = Math.max(8, Math.min(innerHeight - r.height - 8, y - r.height / 2)) + 'px';
  }
  /** the callouts' leader lines, from each label to its point on the turning item */
  private leaders() {
    const svg = this.plinthEl.querySelector('svg')!, base = this.plinthEl.getBoundingClientRect(), pts = this.plinthView.points();
    const calls = [...this.plinthEl.querySelectorAll<HTMLElement>('.calls > div')];
    let d = '';
    calls.forEach((c, i) => {
      const r = c.getBoundingClientRect(), p = pts[i] ?? pts[0];
      const ax = r.left - base.left - 2, ay = r.top + Math.min(r.height / 2, 14) - base.top;
      d += leaderPath(ax, ay, p[0] - base.left, p[1] - base.top, i + 1) + ' ';
    });
    const k = ik();
    svg.innerHTML = `<path d="${d}" fill="none" stroke="${INK_HEX}" stroke-width="${k}" stroke-linecap="square"/>` + pts.map((p) => `<rect x="${Math.round(p[0] - base.left - k * 1.5)}" y="${Math.round(p[1] - base.top - k * 1.5)}" width="${k * 3}" height="${k * 3}" fill="${INK_HEX}"/>`).join('');
  }
  // ---------------------------------------------------------------- drag and drop (a real item, carried)
  startDrag(w: InvWindow, s: Stack, n: number, gx: number, gy: number, e: PointerEvent) {
    this.plinth(null);
    const ghost = document.createElement('div'); ghost.className = 'inv-ghost';
    document.body.appendChild(ghost);
    this.drag = { w, s, n, rot: s.rot, gx, gy, ghost, moved: false, sx: e.clientX, sy: e.clientY };
    this.paintGhost();
    this.moveDrag(e.clientX, e.clientY);
    const mv = (ev: PointerEvent) => this.moveDrag(ev.clientX, ev.clientY);
    const ctx = (ev: MouseEvent) => { ev.preventDefault(); this.rotateDrag(); };
    const up = (ev: PointerEvent) => {
      if (ev.button === 2) return;
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('contextmenu', ctx, true);
      this.endDrag(ev.clientX, ev.clientY);
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('contextmenu', ctx, true);
  }
  private paintGhost() {
    const d = this.drag!, px = 64 * ik(), sz = itemDef(d.s.item).size, turned = d.rot && sz[0] !== sz[1];
    d.ghost.innerHTML = `<img src="${itemIcon(d.s.item, 64)}" style="width:${px}px;height:${px}px;${turned ? 'transform:rotate(90deg)' : ''}">${d.n > 1 ? `<span class="cnt">${d.n}</span>` : ''}`;
  }
  private rotateDrag() {
    const d = this.drag; if (!d) return;
    const sz = itemDef(d.s.item).size; if (sz[0] === sz[1]) return;
    d.rot = d.rot ? 0 : 1; this.paintGhost(); sfx('click', 1.4, 0.4);
  }
  private target(x: number, y: number): { w: InvWindow; cx: number; cy: number } | null {
    for (const w of [...this.wins].reverse()) { const at = w.cellAt(x, y); if (at) return { w, cx: at[0], cy: at[1] }; }
    return null;
  }
  private moveDrag(x: number, y: number) {
    const d = this.drag; if (!d) return;
    if (Math.hypot(x - d.sx, y - d.sy) > 4 && !d.moved) { d.moved = true; d.w.liftStack(d.s); }
    const half = 32 * ik();
    d.ghost.style.left = x - half + 'px'; d.ghost.style.top = y - half * 1.5 + 'px';
    for (const w of this.wins) w.hideDrop();
    if (!d.moved) return;
    const t = this.target(x, y); if (!t) return;
    const [w, h] = t.w.c.dims(d.s.item, d.rot), px = t.cx - Math.floor((w - 1) / 2), py = t.cy - Math.floor((h - 1) / 2);
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
    const [w, h] = t.w.c.dims(d.s.item, d.rot), px = t.cx - Math.floor((w - 1) / 2), py = t.cy - Math.floor((h - 1) / 2), src = d.w.c, dst = t.w.c, st = this.store;
    if (dst === src) {
      const o = src.occ(d.s), under = t.cx >= 0 && t.cy >= 0 && t.cx < src.W && t.cy < src.H ? src.stacks[o[t.cy * src.W + t.cx]] : undefined;
      if (d.n < d.s.n) {
        const k = d.n;
        if (under && under.item === d.s.item) { const lim = itemDef(d.s.item).stack, m = Math.min(k, lim - under.n); if (m > 0) { under.n += m; d.s.n -= m; src.touch(); st.changed(src); this.fire('merged', src); } return; }
        if (!src.fits(d.s.item, px, py, d.rot)) { t.w.flashNote('no room there'); sfx('deny'); return; }
        d.s.n -= k; src.stacks.push({ item: d.s.item, n: k, x: px, y: py, rot: d.rot, fresh: d.s.fresh }); src.touch(); st.changed(src); this.fire('split', src); sfx('click', 0.9, 0.5);
        return;
      }
      const merging = under && under.item === d.s.item && under !== d.s;
      if (src.place(d.s, merging ? t.cx : px, merging ? t.cy : py, d.rot)) { sfx('click', 0.9, 0.5); st.changed(src); this.fire(merging ? 'merged' : 'moved', src); }
      else { t.w.flashNote('no room there'); sfx('deny'); }
      return;
    }
    const why = dst.why(d.s.item);
    if (why) { t.w.flashNote(why.toLowerCase()); sfx('deny'); return; }
    const got = st.transfer(src, d.s, d.n, dst, px, py, d.rot);
    if (got <= 0) { t.w.flashNote(`${dst.label.toLowerCase()} is full`); sfx('deny'); return; }
    if (got < d.n) t.w.flashNote(`only ${got} fit`);
    sfx('click', 0.8, 0.6); this.fire('moved', dst);
  }
  cancelDrag() { const d = this.drag; if (!d) return; this.drag = null; d.ghost.remove(); for (const w of this.wins) { w.hideDrop(); w.liftStack(null); } }
  /** double-click: the whole stack to the other open sheet */
  quickMove(w: InvWindow, s: Stack) {
    const other = this.wins.find((o) => o !== w);
    if (!other) { w.flashNote('open a second container to move things across'); return; }
    const why = other.c.why(s.item);
    if (why) { other.flashNote(why.toLowerCase()); sfx('deny'); return; }
    const got = this.store.move(w.c, other.c, s.item, s.n);
    if (got) { sfx('click', 0.8, 0.6); this.fire('moved', other.c); } else { other.flashNote(`${other.c.label.toLowerCase()} is full`); sfx('deny'); }
  }
  dispose() { cancelAnimationFrame(this.raf); this.closeAll(); this.tipEl.remove(); this.plinth(null); this.plinthEl.remove(); }
}

let UI: InvUI | null = null;
/** the inventory UI for a game (created on first use) */
export function invUI(g: Game): InvUI | null {
  const st = (g as unknown as { storage?: Storage }).storage; if (!st) return null;
  if (!UI || UI.g !== g) { UI?.dispose(); UI = new InvUI(g, st); st.onOpen = (c) => UI!.open(c); }
  return UI;
}
/** open a container's sheet */
export function openInventory(g: Game, c: Container) { return invUI(g)?.open(c) ?? null; }
