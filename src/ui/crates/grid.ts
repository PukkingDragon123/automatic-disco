// The grid inventory: a container's window. Items lie on the container's grid at their real size (a log takes two
// cells, a hide four); drag to move (R or right-click while dragging turns it), drop on a matching stack to merge,
// drop on the other open window to move it across, right-click to split a stack in half, shift-drag to carry half,
// double-click to send a stack to the other window. SORT re-lays the grid by type, name, count, value or freshness;
// FILTER chips and the search line light what matches and dim the rest. The gear opens the container's settings:
// label, logo, paint, priority, allow and deny filters, and the workers linked to it. Two windows open side by side.
import type { Game } from '../../game/game';
import { ITEMS, ITEM_IDS, ITEM_GROUPS, itemDef, itemIcon, type ItemId, type ItemGroup } from '../../factory/items';
import type { Container, Stack, SortKey } from '../../inv/container';
import type { Storage } from '../../inv/storage';
import { DAY } from '../../inv/storage';
import { KIND_INFO, PAINTS, PAINT_IDS, LOGO_IDS } from '../../inv/kinds';
import { drawLogoBadge } from '../../inv/tex';
import { logoURL, LOGO_NAME } from '../../inv/logos';
import { injectCrateCSS, paintBg } from './style';
import { panelURL, screenURL, wellURL, lampURL } from './hw';
import { PH, AM } from '../machine';
import { sfx } from '../../audio/audio';

const SORTS: { k: SortKey; name: string }[] = [{ k: 'type', name: 'TYPE' }, { k: 'name', name: 'NAME' }, { k: 'count', name: 'COUNT' }, { k: 'value', name: 'VALUE' }, { k: 'fresh', name: 'FRESH' }];
const ik = () => (innerHeight >= 1000 ? 2 : 1);
/** a grid cell: 34 art pixels (a 32 px item sprite at 1:1 art, in a socket), shown at --ik */
const CELL = 34, PAD = 4, MAN = 132;
const cellPx = () => CELL * ik();
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const hexs = (c: number) => '#' + c.toString(16).padStart(6, '0');
export type InvEvent = 'opened' | 'sorted' | 'filtered' | 'split' | 'moved' | 'merged' | 'settings' | 'priority' | 'filterset' | 'closed';

interface Drag { w: InvWindow; s: Stack; n: number; rot: 0 | 1; gx: number; gy: number; ghost: HTMLElement; moved: boolean; sx: number; sy: number }

class InvWindow {
  readonly root: HTMLDivElement;
  private plate: HTMLCanvasElement;
  private gridEl: HTMLDivElement; private screen: HTMLDivElement;
  private chips: HTMLDivElement; private foot: HTMLDivElement; private note: HTMLDivElement; private setEl: HTMLDivElement;
  private search: HTMLInputElement; private man: HTMLDivElement;
  private ver = -1; private look = '';
  group: ItemGroup | null = null; query = '';
  sortKey: SortKey | null = null;
  settings = false;
  drop: HTMLDivElement;
  constructor(readonly ui: InvUI, readonly c: Container) {
    const r = (this.root = document.createElement('div'));
    r.className = 'inv-win pop';
    r.innerHTML = `
      <div class="inv-head"><canvas class="plate" width="24" height="24"></canvas>
        <div class="inv-title"><div class="lab inv-t"></div><div class="kind"></div></div>
        <div class="inv-pri" title="Priority: containers with a higher priority fill first"></div>
        <button class="inv-key sq gear" title="Container settings: label, logo, paint, priority, filters, workers">${GEAR}</button>
        <button class="inv-key sq x" title="Close (Esc)">${CROSS}</button></div>
      <div class="inv-bar srt"><span class="k">SORT</span></div>
      <div class="inv-bar flt"><div class="inv-search"><input type="text" placeholder="SEARCH" spellcheck="false"></div></div>
      <div class="inv-bar chips"></div>
      <div class="inv-body"><div class="inv-screen"><div class="inv-grid"></div></div><div class="inv-man"><div class="mh">MANIFEST</div><div class="ml"></div></div></div>
      <div class="inv-foot"></div><div class="inv-note"></div><div class="inv-set" style="display:none"></div>`;
    this.plate = r.querySelector('canvas.plate')!;
    this.gridEl = r.querySelector('.inv-grid')!; this.screen = r.querySelector('.inv-screen')!;
    this.chips = r.querySelector('.chips')!; this.foot = r.querySelector('.inv-foot')!; this.note = r.querySelector('.inv-note')!; this.setEl = r.querySelector('.inv-set')!;
    this.search = r.querySelector('input')!;
    this.man = r.querySelector('.ml')!;
    this.drop = document.createElement('div'); this.drop.className = 'inv-drop'; this.drop.style.display = 'none';
    const srt = r.querySelector('.srt')!;
    for (const s of SORTS) {
      const b = document.createElement('button'); b.className = 'inv-key'; b.textContent = s.name; b.dataset.sort = s.k;
      b.title = `Sort by ${s.name.toLowerCase()} (click again to reverse)`;
      b.onclick = () => this.doSort(s.k);
      srt.appendChild(b);
    }
    r.querySelector<HTMLButtonElement>('.x')!.onclick = () => ui.close(this);
    r.querySelector<HTMLButtonElement>('.gear')!.onclick = () => { this.settings = !this.settings; this.renderSettings(); this.keepOnScreen(); sfx('click', 1, 0.5); if (this.settings) ui.fire('settings', this.c); };
    this.search.addEventListener('input', () => { this.query = this.search.value.trim().toLowerCase(); this.applyFilter(); if (this.query) ui.fire('filtered', this.c); });
    this.search.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { this.search.value = ''; this.query = ''; this.applyFilter(); this.search.blur(); } });
    // drag the window by its head
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
    document.body.appendChild(r);
    setTimeout(() => r.classList.remove('pop'), 300);
    this.frame();
  }
  /** a window that grew (the settings drawer) slides up to stay on screen */
  keepOnScreen() {
    const r = this.root.getBoundingClientRect();
    if (r.bottom > innerHeight - 8) this.root.style.top = Math.max(8, innerHeight - 8 - r.height) + 'px';
  }
  /** the stencilled head plate, the title, the priority pips */
  private renderHead() {
    const look = `${this.c.logo}|${this.c.color}|${this.c.label}|${this.c.priority}`;
    if (look === this.look) return;
    this.look = look;
    const x = this.plate.getContext('2d')!;
    drawLogoBadge(x, this.c.logo, this.c.color, 24, 24);
    this.root.querySelector('.lab')!.textContent = this.c.label;
    const I = KIND_INFO[this.c.kind];
    this.root.querySelector('.kind')!.textContent = `${I.name.toUpperCase()} ${this.c.W}×${this.c.H}`;
    const pri = this.root.querySelector<HTMLDivElement>('.inv-pri')!;
    pri.innerHTML = this.c.kind === 'hold' ? '' : [1, 2, 3, 4, 5].map((k) => `<img src="${lampURL(k <= this.c.priority, AM)}">`).join('');
    (this.root.querySelector('.gear') as HTMLElement).style.display = this.c.kind === 'hold' ? 'none' : '';
  }
  /** category chips with counts (a chip with nothing in this container is dimmed) */
  private renderChips() {
    const by = new Map<ItemGroup, number>();
    for (const s of this.c.stacks) { const g = itemDef(s.item).group; by.set(g, (by.get(g) ?? 0) + s.n); }
    const all = this.c.count();
    this.chips.innerHTML = `<button class="inv-chip ${this.group ? '' : 'on'}" data-g="">ALL <span class="n">${all}</span></button>` +
      ITEM_GROUPS.filter((g) => by.get(g.k) || this.group === g.k).map((g) => `<button class="inv-chip ${this.group === g.k ? 'on' : ''}" data-g="${g.k}" title="Show only ${g.name.toLowerCase()}">${g.name.toUpperCase()} <span class="n">${by.get(g.k) ?? 0}</span></button>`).join('');
    this.chips.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => { this.group = (b.dataset.g || null) as ItemGroup | null; sfx('click', 1.2, 0.4); this.renderChips(); this.applyFilter(); this.ui.fire('filtered', this.c); }));
  }
  private matches(s: Stack) {
    const d = itemDef(s.item);
    if (this.group && d.group !== this.group) return false;
    if (this.query && !(d.name.toLowerCase().includes(this.query) || d.group.includes(this.query) || d.tags.some((t) => t.includes(this.query)))) return false;
    return true;
  }
  applyFilter() {
    const any = !!this.group || !!this.query;
    this.gridEl.querySelectorAll<HTMLDivElement>('.inv-stack').forEach((el) => {
      const s = this.c.stacks[Number(el.dataset.i)]; if (!s) return;
      const m = this.matches(s);
      el.classList.toggle('dim', any && !m); el.classList.toggle('hit', any && m);
    });
  }
  /** the grid: empty cells, then each stack spanning its cells, icon drawn at the size it is shown at */
  renderGrid() {
    const C = cellPx(), W = this.c.W, H = this.c.H, k = ik();
    // the glass: painted to the grid's exact size, a socket per cell
    const sw = W * CELL + PAD * 2, sh = H * CELL + PAD * 2;
    Object.assign(this.screen.style, { width: sw * k + 'px', height: sh * k + 'px', backgroundImage: `url(${screenURL(W, H, CELL, PAD)})`, backgroundSize: `${sw * k}px ${sh * k}px` });
    Object.assign(this.gridEl.style, { left: PAD * k + 'px', top: PAD * k + 'px', width: W * C + 'px', height: H * C + 'px' });
    const manEl = this.man.parentElement as HTMLDivElement;
    manEl.style.width = MAN * k + 'px'; manEl.style.height = sh * k + 'px';
    manEl.style.backgroundImage = `url(${wellURL(MAN, sh)})`; manEl.style.backgroundSize = `${MAN * k}px ${sh * k}px`;
    let html = '';
    this.c.stacks.forEach((s, i) => {
      const [w, h] = this.c.dims(s.item, s.rot), d = itemDef(s.item);
      const px = 32 * k, ico = itemIcon(s.item, 32);
      const p = d.perish, keep = this.c.keeps(s.item);
      const fr = p ? `<div class="fr ${keep ? 'keep' : s.fresh < 0.25 ? 'bad' : s.fresh < 0.5 ? 'warn' : ''}"><b style="width:${Math.round(s.fresh * 100)}%"></b></div>` : '';
      const ix = (w * C - px) / 2, iy = (h * C - px) / 2;
      const rotS = s.rot && w !== h ? 'transform:rotate(90deg);' : '';
      html += `<div class="inv-stack" data-i="${i}" style="left:${s.x * C}px;top:${s.y * C}px;width:${w * C}px;height:${h * C}px">` +
        `<img src="${ico}" style="left:${ix}px;top:${iy}px;width:${px}px;height:${px}px;${rotS}">${s.n > 1 ? `<span class="cnt">${s.n}</span>` : ''}${fr}</div>`;
    });
    this.gridEl.innerHTML = html;
    this.gridEl.appendChild(this.drop);
    this.gridEl.querySelectorAll<HTMLDivElement>('.inv-stack').forEach((el) => this.bindStack(el));
    this.applyFilter();
    this.renderManifest();
    // the window hugs its grid and manifest; the bars wrap to that width; then its panel is painted to fit
    this.root.style.width = Math.max(320 * k, (sw + MAN + 3 + 4 + 18) * k) + 'px';
    requestAnimationFrame(() => this.paint());
  }
  /** the painted panel and wells, at the window's exact size */
  paint() {
    const k = ik();
    paintBg(this.root, (w, h) => panelURL(w, h, 30, this.c.id), k);
    const se = this.search.parentElement as HTMLElement;
    paintBg(se, (w, h) => wellURL(w, h), k);
    if (this.settings) paintBg(this.setEl, (w, h) => wellURL(w, h), k);
  }
  /** the cargo manifest: every kind held, its count, freshness and mass; hover lights its stacks, click searches it */
  private renderManifest() {
    const rows = this.c.contents();
    const k = ik();
    this.man.innerHTML = rows.length ? rows.map((e) => {
      const d = itemDef(e.item), p = d.perish, keep = this.c.keeps(e.item);
      const fr = p ? `<i class="mf ${keep ? 'keep' : e.fresh < 0.25 ? 'bad' : e.fresh < 0.5 ? 'warn' : ''}"><b style="width:${Math.round(e.fresh * 100)}%"></b></i>` : '';
      return `<div class="mrow" data-it="${e.item}"><img src="${itemIcon(e.item, 32)}"><span class="nm">${esc(d.name)}</span><span class="n">${e.n}</span>${fr}</div>`;
    }).join('') : '<div class="mrow empty">EMPTY</div>';
    this.man.querySelectorAll<HTMLDivElement>('.mrow[data-it]').forEach((el) => {
      const id = el.dataset.it as ItemId;
      el.onpointerenter = () => this.gridEl.querySelectorAll<HTMLDivElement>('.inv-stack').forEach((q) => { const s = this.c.stacks[Number(q.dataset.i)]; q.classList.toggle('hit', s?.item === id); q.classList.toggle('dim', !!s && s.item !== id); });
      el.onpointerleave = () => this.applyFilter();
      el.onclick = () => { this.search.value = itemDef(id).name; this.query = itemDef(id).name.toLowerCase(); this.applyFilter(); this.ui.fire('filtered', this.c); sfx('click', 1.2, 0.4); };
    });
  }
  private bindStack(el: HTMLDivElement) {
    const i = Number(el.dataset.i);
    el.addEventListener('pointerdown', (e) => {
      const s = this.c.stacks[i]; if (!s || this.ui.drag) return;
      if (e.button === 2) { e.preventDefault(); this.splitHalf(s); return; }
      if (e.button !== 0) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect(), C = cellPx();
      this.ui.startDrag(this, s, e.shiftKey && s.n > 1 ? Math.ceil(s.n / 2) : s.n, Math.floor((e.clientX - rect.left) / C), Math.floor((e.clientY - rect.top) / C), e);
    });
    el.addEventListener('dblclick', () => { const s = this.c.stacks[i]; if (s) this.ui.quickMove(this, s); });
    el.addEventListener('pointerenter', (e) => { const s = this.c.stacks[i]; if (s && !this.ui.drag) this.ui.tip(this.tipHTML(s), e.clientX, e.clientY); });
    el.addEventListener('pointermove', (e) => { if (!this.ui.drag) this.ui.tipMove(e.clientX, e.clientY); });
    el.addEventListener('pointerleave', () => this.ui.tip(null));
  }
  splitHalf(s: Stack) {
    if (s.n < 2) { this.flashNote('One item: nothing to split'); return; }
    const ns = this.c.split(s, Math.floor(s.n / 2));
    if (!ns) { this.flashNote('No free cell to split into'); sfx('deny'); return; }
    sfx('click', 0.8, 0.6); this.ui.store.changed(this.c); this.ui.fire('split', this.c);
  }
  private tipHTML(s: Stack) {
    const d = itemDef(s.item), p = d.perish, keep = this.c.keeps(s.item);
    const where = Object.values(KIND_INFO).filter((k) => k.kind !== 'hold' && d.tags.some((t) => k.accepts.includes(t))).map((k) => k.name).join(', ');
    let fresh = '';
    if (p) {
      const days = (s.fresh * p.days);
      fresh = keep ? `<div class="g">Kept fresh in here</div>` : `<div class="${s.fresh < 0.3 ? 'r' : 'w'}">${Math.round(s.fresh * 100)}% fresh · spoils in ${days < 1 ? Math.max(1, Math.round(days * DAY / 60)) + ' min' : days.toFixed(1) + ' days'}${p.into ? ' to ' + ITEMS[p.into]?.name.toLowerCase() : ''}</div>`;
    }
    return `<h4>${esc(d.name)}</h4><div class="row"><span>${s.n} / ${d.stack}</span><span class="g">${d.group.toUpperCase()} · ${d.size[0]}×${d.size[1]}</span></div>` +
      `<div class="row"><span class="g">MASS</span><span>${fmtKg(d.mass * s.n)}</span></div><div class="row"><span class="g">VALUE</span><span>${Math.round(d.value * s.n * 10) / 10}</span></div>` +
      fresh + `<div>${esc(d.desc)}</div>` + (where ? `<div class="g">Stored in: ${esc(where)}</div>` : '');
  }
  private renderFoot() {
    const used = this.c.fill(), mass = this.c.stacks.reduce((m, s) => m + itemDef(s.item).mass * s.n, 0);
    const cells = Math.round(used * this.c.W * this.c.H);
    const pw = KIND_INFO[this.c.kind].power ? (this.c.powered() ? ' · POWER OK' : ' · <span style="color:var(--warn)">NO POWER</span>') : '';
    this.foot.innerHTML = `<span>${cells}/${this.c.W * this.c.H} CELLS</span><div class="inv-meter ${used > 0.9 ? 'full' : ''}"><b style="width:calc(${Math.round(used * 100)}% - ${2 * ik()}px)"></b></div><span>${fmtKg(mass)}${pw}</span>`;
  }
  private noteT = 0;
  flashNote(s: string) { this.note.textContent = s; this.noteT = performance.now() + 2600; }
  doSort(k: SortKey) {
    const desc = this.sortKey === k;
    this.c.sort(k, desc); this.sortKey = desc ? null : k;
    this.root.querySelectorAll<HTMLButtonElement>('.srt button').forEach((b) => b.classList.toggle('act', b.dataset.sort === k));
    sfx('click', 0.9, 0.6); this.ui.store.changed(this.c); this.ui.fire('sorted', this.c);
  }
  // ---------------------------------------------------------------- settings
  renderSettings() {
    const c = this.c, el = this.setEl;
    this.root.querySelector('.gear')!.classList.toggle('act', this.settings);
    el.style.display = this.settings ? '' : 'none';
    requestAnimationFrame(() => { this.root.dataset.bg = ''; this.setEl.dataset.bg = ''; this.paint(); });
    if (!this.settings) return;
    const I = KIND_INFO[c.kind];
    const takes = ITEM_IDS.filter((id) => ITEMS[id].cat !== 'internal' && c.takesKind(id));
    const crew = this.ui.store.linked(c);
    el.innerHTML = `
      <span class="k">LABEL</span><div><input class="lbl" maxlength="14" value="${esc(c.label)}"></div>
      <span class="k">LOGO</span><div class="inv-logos">${LOGO_IDS.map((l) => `<button data-l="${l}" class="${c.logo === l ? 'on' : ''}" title="${LOGO_NAME[l]}"><img src="${logoURL(l, c.logo === l ? '#e5dbc3' : '#a29d8c', ik())}"></button>`).join('')}</div>
      <span class="k">PAINT</span><div class="inv-paints">${PAINT_IDS.map((p) => `<button data-p="${p}" class="${c.color === p ? 'on' : ''}" title="${PAINTS[p].name}"><i style="background:${hexs(PAINTS[p].base)}"></i></button>`).join('')}</div>
      <span class="k">PRIORITY</span><div class="inv-mode">${[1, 2, 3, 4, 5].map((k) => `<button class="inv-key ${c.priority === k ? 'act' : ''}" data-pr="${k}">${k}</button>`).join('')}<span>&nbsp;${c.priority >= 4 ? 'FILLS FIRST' : c.priority <= 2 ? 'OVERFLOW' : 'NORMAL'}</span></div>
      <span class="k">FILTER</span><div><div class="inv-mode" style="margin-bottom:${ik()}px"><span>CLICK: ALLOW · AGAIN: DENY · AGAIN: CLEAR</span>${c.allow.length || c.deny.length ? `<button class="inv-key w clr">CLEAR ALL</button>` : ''}</div>
        <div class="inv-picks">${takes.map((id) => `<button data-it="${id}" class="${c.allow.includes(id) ? 'allow' : c.deny.includes(id) ? 'deny' : ''}" title="${esc(ITEMS[id].name)}"><img src="${itemIcon(id, 32)}"></button>`).join('')}</div>
        <div class="inv-mode">${c.allow.length ? `ONLY ${c.allow.length} ALLOWED` : `TAKES ${I.accepts.join(', ').toUpperCase()}`}${c.deny.length ? ` · ${c.deny.length} DENIED` : ''}</div></div>
      <span class="k">WORKERS</span><div class="inv-crew">${crew.map((w, i) => `<span class="w">${esc(w.c.sp.name)} <b data-un="${i}" title="Unlink">×</b></span>`).join('')}<button class="inv-key w link">LINK WORKER</button><span class="inv-mode">${crew.length ? '' : 'LINKED HAULERS KEEP IT STOCKED'}</span></div>`;
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
      b.onpointerenter = (e) => this.ui.tip(`<h4>${esc(ITEMS[b.dataset.it!].name)}</h4><div class="g">${c.allow.includes(b.dataset.it!) ? 'Allowed' : c.deny.includes(b.dataset.it!) ? 'Denied' : 'Not set'}</div>`, e.clientX, e.clientY);
      b.onpointerleave = () => this.ui.tip(null);
    });
    el.querySelector<HTMLButtonElement>('.clr')?.addEventListener('click', () => { c.allow = []; c.deny = []; c.touch(); this.ui.store.changed(c); this.renderSettings(); });
    el.querySelector<HTMLButtonElement>('.link')!.onclick = () => this.linkWorker();
    el.querySelectorAll<HTMLElement>('[data-un]').forEach((b) => (b.onclick = () => { const w = crew[Number(b.dataset.un)]; const wk = (this.ui.g.factory as unknown as { workers?: { release(c: unknown): void } }).workers; if (w && wk) wk.release(w.c); this.renderSettings(); }));
  }
  private linkWorker() {
    const wk = (this.ui.g.factory as unknown as { workers?: { list: { c: { dead: boolean; x: number; z: number }; job: string }[]; assign(c: unknown, job: string, t: unknown): string | null } }).workers;
    if (!wk || !this.c.b) { this.flashNote('No workers yet: convert or print a creature first'); sfx('deny'); return; }
    const b = this.c.b;
    const idle = wk.list.filter((w) => !w.c.dead && w.job === 'idle').sort((a, q) => Math.hypot(a.c.x - b.x, a.c.z - b.z) - Math.hypot(q.c.x - b.x, q.c.z - b.z));
    if (!idle.length) { this.flashNote('Every worker is busy: free one first'); sfx('deny'); return; }
    const err = wk.assign(idle[0].c, 'haul', b);
    if (err) { this.flashNote(err); sfx('deny'); return; }
    sfx('done', 1, 0.5); this.renderSettings();
  }
  /** keep in step with the container (cheap when nothing changed) */
  frame() {
    this.renderHead();
    if (this.ver !== this.c.ver) { this.ver = this.c.ver; this.renderGrid(); this.renderChips(); this.renderFoot(); if (this.settings) this.renderSettings(); }
    if (this.noteT && performance.now() > this.noteT) { this.note.textContent = ''; this.noteT = 0; }
  }
  /** the grid cell under a screen point, or null when it is not over this grid */
  cellAt(x: number, y: number): [number, number] | null {
    const r = this.gridEl.getBoundingClientRect();
    if (x < r.left - 4 || y < r.top - 4 || x > r.right + 4 || y > r.bottom + 4) return null;
    const C = cellPx();
    return [Math.floor((x - r.left) / C), Math.floor((y - r.top) / C)];
  }
  showDrop(x: number, y: number, w: number, h: number, kind: '' | 'bad' | 'merge') {
    const C = cellPx();
    Object.assign(this.drop.style, { display: '', left: x * C + 'px', top: y * C + 'px', width: w * C + 'px', height: h * C + 'px' });
    this.drop.className = 'inv-drop ' + kind;
  }
  hideDrop() { this.drop.style.display = 'none'; }
  liftStack(s: Stack | null) { this.gridEl.querySelectorAll<HTMLDivElement>('.inv-stack').forEach((el) => el.classList.toggle('lift', !!s && this.c.stacks[Number(el.dataset.i)] === s)); }
  get screenEl() { return this.screen; }
}
const fmtKg = (kg: number) => (kg >= 1000 ? (kg / 1000).toFixed(1) + ' T' : kg >= 10 ? Math.round(kg) + ' KG' : (Math.round(kg * 10) / 10) + ' KG');
const GEAR = `<svg viewBox="0 0 8 8" shape-rendering="crispEdges"><path fill="currentColor" d="M3 0h2v1h1v1h1v1h1v2H7v1H6v1H5v1H3V7H2V6H1V5H0V3h1V2h1V1h1zM3 3v2h2V3z"/></svg>`;
const CROSS = `<svg viewBox="0 0 8 8" shape-rendering="crispEdges"><path fill="currentColor" d="M1 1h2v1h2V1h2v2H6v2h1v2H5V6H3v1H1V5h1V3H1z"/></svg>`;

// ------------------------------------------------------------------ the manager: up to two windows, the drag, the tooltip
export class InvUI {
  wins: InvWindow[] = [];
  drag: Drag | null = null;
  moved = false;
  private tipEl: HTMLDivElement;
  private handlers: Partial<Record<InvEvent, ((c: Container) => void)[]>> = {};
  private raf = 0;
  constructor(readonly g: Game, readonly store: Storage) {
    injectCrateCSS();
    this.tipEl = document.createElement('div'); this.tipEl.className = 'inv-tip'; document.body.appendChild(this.tipEl);
    addEventListener('keydown', (e) => {
      if (!this.wins.length) return;
      if (this.drag && (e.key === 'r' || e.key === 'R')) { this.rotateDrag(); e.stopPropagation(); e.preventDefault(); }
      else if (e.key === 'Escape') { if (this.drag) this.cancelDrag(); else this.close(this.wins[this.wins.length - 1]); e.stopPropagation(); }
    }, true);
    const tick = () => { this.raf = requestAnimationFrame(tick); for (const w of this.wins) w.frame(); };
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
  /** open a container's window (a second one goes beside the first; a third replaces the oldest) */
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
    this.wins.splice(i, 1); w.root.remove();
    if (this.drag?.w === w) this.cancelDrag();
    this.tip(null);
    if (!quiet) { sfx('click', 0.6, 0.4); this.layout(); }
    this.fire('closed', w.c);
  }
  closeAll() { for (const w of [...this.wins]) this.close(w, true); }
  front(w: InvWindow) { for (const o of this.wins) o.root.style.zIndex = o === w ? '41' : '40'; }
  /** one window: centred a little left of the middle; two: side by side */
  layout() {
    if (this.moved && this.wins.length === 1) return;
    const gap = 12 * ik();
    const ws = this.wins.map((w) => w.root.getBoundingClientRect());
    const total = ws.reduce((s, r) => s + r.width, 0) + gap * (ws.length - 1);
    let x = Math.max(8, (innerWidth - total) / 2);
    const tallest = Math.max(...ws.map((r) => r.height));
    const top = Math.round(Math.max(8, (innerHeight - tallest) / 2 - 40));
    this.wins.forEach((w, i) => {
      const r = ws[i];
      w.root.style.left = Math.round(x) + 'px';
      w.root.style.top = top + 'px';
      x += r.width + gap;
    });
    this.moved = false;
  }
  // ---------------------------------------------------------------- tooltip
  tip(html: string | null, x = 0, y = 0) {
    if (!html) { this.tipEl.style.display = 'none'; return; }
    this.tipEl.innerHTML = html.replace('<h4>', '<h4 class="inv-t">'); this.tipEl.style.display = 'block';
    paintBg(this.tipEl, (w, h) => wellURL(w, h), ik());
    this.tipMove(x, y);
  }
  tipMove(x: number, y: number) { const r = this.tipEl.getBoundingClientRect(); this.tipEl.style.left = Math.min(innerWidth - r.width - 6, x + 16) + 'px'; this.tipEl.style.top = Math.min(innerHeight - r.height - 6, y + 14) + 'px'; }
  // ---------------------------------------------------------------- drag and drop
  startDrag(w: InvWindow, s: Stack, n: number, gx: number, gy: number, e: PointerEvent) {
    this.tip(null);
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
    w.liftStack(s);
  }
  private paintGhost() {
    const d = this.drag!; const [w, h] = d.w.c.dims(d.s.item, d.rot), C = cellPx(), px = 32 * ik();
    d.ghost.style.width = w * C + 'px'; d.ghost.style.height = h * C + 'px';
    const sz = itemDef(d.s.item).size, turned = d.rot && sz[0] !== sz[1];
    d.ghost.innerHTML = `<img src="${itemIcon(d.s.item, 32)}" style="left:${(w * C - px) / 2}px;top:${(h * C - px) / 2}px;width:${px}px;height:${px}px;${turned ? 'transform:rotate(90deg)' : ''}">${d.n > 1 ? `<span class="cnt">${d.n}</span>` : ''}`;
  }
  private rotateDrag() {
    const d = this.drag; if (!d) return;
    const sz = itemDef(d.s.item).size; if (sz[0] === sz[1]) return;
    d.rot = d.rot ? 0 : 1; [d.gx, d.gy] = [d.gy, d.gx];
    this.paintGhost(); sfx('click', 1.4, 0.4);
  }
  private target(x: number, y: number): { w: InvWindow; cx: number; cy: number } | null {
    for (const w of [...this.wins].reverse()) { const at = w.cellAt(x, y); if (at) return { w, cx: at[0], cy: at[1] }; }
    return null;
  }
  private moveDrag(x: number, y: number) {
    const d = this.drag; if (!d) return;
    if (Math.hypot(x - d.sx, y - d.sy) > 4) d.moved = true;
    const C = cellPx();
    d.ghost.style.left = x - d.gx * C - C / 2 + 'px'; d.ghost.style.top = y - d.gy * C - C / 2 + 'px';
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
        // carrying half: put it down as a new stack (or onto a matching one)
        const k = d.n;
        if (under && under.item === d.s.item) { const lim = itemDef(d.s.item).stack, m = Math.min(k, lim - under.n); if (m > 0) { under.n += m; d.s.n -= m; src.touch(); st.changed(src); this.fire('merged', src); } return; }
        if (!src.fits(d.s.item, px, py, d.rot)) { t.w.flashNote('No room there'); sfx('deny'); return; }
        d.s.n -= k; src.stacks.push({ item: d.s.item, n: k, x: px, y: py, rot: d.rot, fresh: d.s.fresh }); src.touch(); st.changed(src); this.fire('split', src); sfx('click', 0.9, 0.5);
        return;
      }
      const merging = under && under.item === d.s.item && under !== d.s;
      if (src.place(d.s, merging ? t.cx : px, merging ? t.cy : py, d.rot)) { sfx('click', 0.9, 0.5); st.changed(src); this.fire(merging ? 'merged' : 'moved', src); }
      else { t.w.flashNote('No room there'); sfx('deny'); }
      return;
    }
    const why = dst.why(d.s.item);
    if (why) { t.w.flashNote(why); sfx('deny'); return; }
    const got = st.transfer(src, d.s, d.n, dst, px, py, d.rot);
    if (got <= 0) { t.w.flashNote(`${dst.label} is full`); sfx('deny'); return; }
    if (got < d.n) t.w.flashNote(`Only ${got} fit`);
    sfx('click', 0.8, 0.6); this.fire('moved', dst);
  }
  cancelDrag() { const d = this.drag; if (!d) return; this.drag = null; d.ghost.remove(); for (const w of this.wins) { w.hideDrop(); w.liftStack(null); } }
  /** double-click: the whole stack to the other open window */
  quickMove(w: InvWindow, s: Stack) {
    const other = this.wins.find((o) => o !== w);
    if (!other) { w.flashNote('Open a second container to move items across'); return; }
    const why = other.c.why(s.item);
    if (why) { other.flashNote(why); sfx('deny'); return; }
    const got = this.store.move(w.c, other.c, s.item, s.n);
    if (got) { sfx('click', 0.8, 0.6); this.fire('moved', other.c); } else { other.flashNote(`${other.c.label} is full`); sfx('deny'); }
  }
  dispose() { cancelAnimationFrame(this.raf); this.closeAll(); this.tipEl.remove(); }
}

let UI: InvUI | null = null;
/** the inventory UI for a game (created on first use) */
export function invUI(g: Game): InvUI | null {
  const st = (g as unknown as { storage?: Storage }).storage; if (!st) return null;
  if (!UI || UI.g !== g) { UI?.dispose(); UI = new InvUI(g, st); st.onOpen = (c) => UI!.open(c); }
  return UI;
}
/** open a container's grid window */
export function openInventory(g: Game, c: Container) { return invUI(g)?.open(c) ?? null; }
