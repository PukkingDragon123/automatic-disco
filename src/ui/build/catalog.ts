// THE BUILD CATALOGUE (V7 "EMPIRE BUILDING + city-builder build UI": a shop-style catalogue like Planet Zoo's and Dragon
// City's). One of the kit's detailed housings (panel()) along the bottom left of build mode:
//   CATEGORY TABS down its left side: push keys with the category's name and how many buildings it holds (lit green
//   while something in it can be built, red while the whole category is locked);
//   a BAR over the cards: SEARCH (names, descriptions, materials, products; it searches every category), SHOW keys
//   (ALL / CAN BUILD / LOCKED: the sub-filters) and SORT keys (CATALOGUE / NAME / TIER / COST / SIZE);
//   a header: the category (or the search), what it is for, and its counts (buildings, unlocked, affordable now);
//   the CARDS: a strip of small steel housings, one per building, each with its outlined picture in a sunk well (it
//   turns right round on its own turntable under the pointer), its tier, how many stand already, its name, size and
//   power, and its bill as item icons with the stores' count (red where short); locked ones dark with a padlock and the
//   one line that unlocks them.
// Hover a card: the detail card (detail.ts) shows everything about it. Click a card: it is picked and taken in hand.
// Drag a card onto the map: the ghost follows the pointer; let go to stake the site.
import type { Factory } from '../../factory/factory';
import { FDEFS, footW, footD, type FKind } from '../../factory/defs';
import { ITEMS, itemIcon } from '../../factory/items';
import { recipesAt } from '../../factory/recipes';
import { BUILD_CATS, kindsIn, catOf, registerColonyBuildings, type BuildCat } from '../../logistics/catalog';
import { buildingLock, type Lock } from '../../logistics/unlocks';
import { panel, pkey, frame, panelSpec, bindTip, type Panel, type PKey, type Frame } from '../kit/panel';
import type { HousingSpec, Tone } from '../kit/machine';
import { art } from './art';
import { spinFrame } from './studio';
import { bpIcon } from './bpicons';
import { play } from './juice';
import { bill, billSum, tierOf, ROMAN, CAT_DESC, catName, esc, fmt, builtOf } from './info';

export interface CatalogHost {
  /** a click: take the building in hand */
  take(kind: FKind): void;
  /** a card dragged out over the map, moved, released */
  dragStart(kind: FKind): void;
  dragMove(x: number, y: number, overUi: boolean): void;
  dragEnd(x: number, y: number, overUi: boolean): void;
  /** is a screen point over build mode's own panels */
  overUi(x: number, y: number): boolean;
}
type Show = 'all' | 'ready' | 'locked';
type Sort = 'cat' | 'name' | 'tier' | 'cost' | 'size';
const SHOW: [Show, string, string][] = [
  ['all', 'ALL', 'Every building in the category, open or locked.'],
  ['ready', 'CAN BUILD', 'Only what is unlocked and paid for from the stores right now.'],
  ['locked', 'LOCKED', 'Only what is still locked, with what opens it.'],
];
const SORT: [Sort, string, string][] = [
  ['cat', 'CATALOGUE', 'The catalogue order: basic first.'],
  ['name', 'A - Z', 'By name.'],
  ['tier', 'TIER', 'By tier (I basic materials .. V advanced), lowest first.'],
  ['cost', 'COST', 'By the size of the bill, cheapest first.'],
  ['size', 'SIZE', 'By footprint, smallest first.'],
];
const FRAMES = 24, PW = 64, PH = 48;

// ------------------------------------------------------------------ turntable frames (shared, a few per frame)
const reels = new Map<FKind, (HTMLCanvasElement | null)[]>();
let budget = 0;
function reelFrame(kind: FKind, i: number): HTMLCanvasElement | null {
  let r = reels.get(kind);
  if (!r) reels.set(kind, (r = new Array(FRAMES).fill(null)));
  if (!r[i] && budget > 0) { budget--; r[i] = spinFrame(kind, PW, PH, (i / FRAMES) * Math.PI * 2); }
  return r[i];
}

/** a card's housing: a small steel box, the picture sunk in a well with a lip, a status lamp in the corner */
function cardSpec(w: number, h: number, tone: Tone, lamp: 'green' | 'amber' | 'red', seed: number): HousingSpec {
  const s = panelSpec(w, h, { tone, seed, well: 'none', head: 6, foot: 6, side: 4, lamps: [], hazard: false, glands: 0, vents: false, guards: false });
  s.seamsY = [];
  s.rivets = false;
  s.wins = [{ x: 6, y: 6, w: w - 12, h: 100, back: true, cut: 4, lip: 3, lipTone: 'dark', screws: false }];
  s.lamps = [{ x: Math.round(w / 2), y: h - 7, r: 3, col: lamp, on: true }];
  return s;
}

class Card {
  readonly el: HTMLDivElement;
  private cv: HTMLCanvasElement; private g: CanvasRenderingContext2D; private img: HTMLImageElement; private costEl: HTMLDivElement; private builtEl: HTMLElement;
  lock: Lock; short = false; hot = false; ang = 0; private spin = 0; private cur = -1; private key = ''; private fr: Frame;
  constructor(readonly kind: FKind, readonly cat: BuildCatalog, i: number) {
    const d = FDEFS[kind], f = cat.f;
    this.lock = buildingLock(f.g, kind);
    const el = (this.el = document.createElement('div'));
    el.className = 'bk-card' + (this.lock.ok ? '' : ' locked');
    el.dataset.kind = kind;
    el.style.setProperty('--i', String(i));
    const t = tierOf(kind), pw = d.power > 0 ? `${fmt(d.power)} MW` : d.power < 0 ? `+${fmt(-d.power)} MW` : 'no power';
    el.innerHTML = `<div class="bk-pic"><img class="bk-art" src="${art(kind)}" alt="" draggable="false"><canvas class="bk-spin" width="${PW}" height="${PH}"></canvas>`
      + `${this.lock.ok ? '' : `<span class="bk-lock"><img src="${bpIcon('lock')}" alt=""></span>`}</div>`
      + `<b class="bk-tier k7-t16">TIER ${ROMAN[t]}</b><b class="bk-built k7-t16"></b>`
      + `<div class="bk-name k7-t16">${esc(d.name)}</div><div class="bk-facts k7-t16">${footW(d, 0)}x${footD(d, 0)} m  ·  ${pw}</div><div class="bk-cost"></div>`;
    this.cv = el.querySelector('canvas')!; this.g = this.cv.getContext('2d')!; this.g.imageSmoothingEnabled = false;
    this.img = el.querySelector('.bk-art')!; this.costEl = el.querySelector('.bk-cost')!; this.builtEl = el.querySelector('.bk-built')!;
    this.refresh();
    this.fr = frame(el, (w, h) => cardSpec(w, h, this.lock.ok ? (this.cat.pick === kind ? 'brass' : 'steel') : 'dark', !this.lock.ok ? 'red' : this.short ? 'amber' : 'green', 31), { pad: 8 });
    el.addEventListener('pointerenter', () => this.setHot(true));
    el.addEventListener('pointerleave', () => this.setHot(false));
  }
  /** the bill and the built count (kept current while the catalogue is open) */
  refresh() {
    const f = this.cat.f, lines = bill(f, this.kind), [n, s] = builtOf(f, this.kind);
    const short = lines.some((l) => l.short);
    const key = `${lines.map((l) => Math.min(l.have, l.need)).join(',')}|${n}|${s}|${this.lock.ok}`;
    if (key === this.key) return;
    const lampChanged = this.key !== '' && short !== this.short;
    this.key = key; this.short = short;
    this.el.classList.toggle('short', short);
    this.builtEl.textContent = n && s ? `${n} BUILT +${s}` : n ? `${n} BUILT` : s ? `${s} SITE${s > 1 ? 'S' : ''}` : '';
    if (!this.lock.ok) this.costEl.innerHTML = `<span class="bk-why k7-t16">${esc(shortWhy(this.lock.why))}</span>`;
    else this.costEl.innerHTML = lines.length ? lines.slice(0, 3).map((l) => `<span class="bk-c${l.short ? ' lack' : ''}"><img src="${itemIcon(l.id, 32)}" alt=""><i class="k7-t16">${l.need}</i></span>`).join('') : '<span class="bk-c free k7-t16">FREE</span>';
    if (lampChanged) this.fr.repaint();
  }
  setHot(on: boolean) {
    if (this.hot === on) return;
    this.hot = on;
    this.el.classList.toggle('hot', on);
    if (on) play('tick', 1.2, 0.22);
    this.cat.hover(on ? this.kind : null, this);
  }
  update(dt: number) {
    // under the pointer it turns right round; let go, it eases back to face front and the painted picture returns
    if (this.hot && this.lock.ok) { this.spin = Math.min(1, this.spin + dt * 4); this.ang += dt * 2.6; }
    else {
      this.spin = Math.max(0, this.spin - dt * 2.5);
      const TAU = Math.PI * 2, r = ((this.ang % TAU) + TAU) % TAU; this.ang = r > Math.PI ? r + (TAU - r) * Math.min(1, dt * 5) : r * (1 - Math.min(1, dt * 5));
    }
    const live = this.spin > 0.01 && (Math.abs(Math.sin(this.ang / 2)) > 0.02 || this.hot);
    this.el.classList.toggle('spin', live);
    if (!live) return;
    const i = ((Math.round((this.ang / (Math.PI * 2)) * FRAMES) % FRAMES) + FRAMES) % FRAMES;
    if (i === this.cur) return;
    const fr = reelFrame(this.kind, i); if (!fr) return;
    this.cur = i; this.g.clearRect(0, 0, PW, PH); this.g.drawImage(fr, 0, 0);
  }
  /** the housing again (picked: brass; the lamp's colour) */
  repaint() { this.fr?.repaint(); }
  ping() { this.el.classList.remove('ping'); void this.el.offsetWidth; this.el.classList.add('ping'); }
  shake() { this.el.classList.remove('shake'); void this.el.offsetWidth; this.el.classList.add('shake'); }
  get imgEl() { return this.img; }
}
/** a lock line short enough for a card ('RESEARCH COLD CHAIN' -> 'Research Cold Chain') */
const shortWhy = (w: string) => { const s = w.charAt(0) + w.slice(1).toLowerCase(); return s.replace(/\b(lv|mk)\b/gi, (m) => m.toUpperCase()); };

export class BuildCatalog {
  readonly pan: Panel;
  readonly root: HTMLDivElement;
  private tabs = new Map<BuildCat, PKey>(); private tabN = new Map<BuildCat, HTMLElement>();
  private showKeys = new Map<Show, PKey>(); private sortKeys = new Map<Sort, PKey>();
  private strip: HTMLDivElement; private head: HTMLDivElement; private sub: HTMLDivElement; private q: HTMLInputElement; private thumb: HTMLDivElement; private track: HTMLDivElement;
  private cards: Card[] = [];
  cat: BuildCat = 'extraction'; show: Show = 'all'; sort: Sort = 'cat'; query = '';
  isOpen = false;
  /** the card under the pointer, and the last card clicked (the detail card shows the hovered one, else the picked) */
  hot: FKind | null = null; pick: FKind | null = null;
  private drag: { kind: FKind; card: Card; x: number; y: number; on: boolean; out: boolean; ghost: HTMLDivElement | null } | null = null;
  private lockKey = ''; private t = 0;

  constructor(readonly f: Factory, readonly host: CatalogHost) {
    registerColonyBuildings();
    const p = (this.pan = panel({ title: 'BUILD CATALOGUE', tone: 'gun', seed: 23, serial: 'SETTLEMENT WORKS', lamps: ['green', 'amber'], glands: 2, stencil: 'DRAG A CARD ONTO THE MAP', cls: 'bk' }));
    this.root = p.el;
    const body = p.body;
    body.innerHTML = `<div class="bk-tabs"></div><div class="bk-main"><div class="bk-bar"><label class="bk-q"><img src="${bpIcon('info')}" alt=""><input class="k7-t16" type="text" spellcheck="false" placeholder="Search buildings, materials..." aria-label="search the catalogue"></label><span class="bk-lbl k7-t16">SHOW</span><span class="bk-show"></span><span class="bk-lbl k7-t16">SORT</span><span class="bk-sort"></span></div>`
      + `<div class="bk-head"></div><div class="bk-sub k7-t16"></div><div class="bk-strip"></div><div class="bk-track"><div class="bk-thumb"></div></div></div>`;
    document.body.appendChild(this.root);
    this.strip = body.querySelector('.bk-strip')!; this.head = body.querySelector('.bk-head')!; this.sub = body.querySelector('.bk-sub')!;
    this.q = body.querySelector('input')!; this.thumb = body.querySelector('.bk-thumb')!; this.track = body.querySelector('.bk-track')!;
    // the tabs: every category, its name and count
    const tabs = body.querySelector('.bk-tabs')!;
    for (const c of BUILD_CATS) {
      const k = pkey(c.name.toUpperCase(), () => this.setCat(c.k), { w: 192, h: 26, tone: 'steel', lamp: 'green', sound: 'tab' });
      const n = document.createElement('b'); n.className = 'bk-tab-n'; k.querySelector('.kkey-t')!.appendChild(n);
      k.classList.add('bk-tab'); k.dataset.cat = c.k;
      tabs.appendChild(k); this.tabs.set(c.k, k); this.tabN.set(c.k, n);
      bindTip(k, () => this.tabTip(c.k));
    }
    const sh = body.querySelector('.bk-show')!, so = body.querySelector('.bk-sort')!;
    for (const [s, l, tip] of SHOW) { const k = pkey(l, () => this.setShow(s), { h: 28, tone: 'cream', lamp: 'amber', sound: 'switch' }); sh.appendChild(k); this.showKeys.set(s, k); bindTip(k, () => ({ title: `SHOW: ${l}`, desc: tip })); }
    for (const [s, l, tip] of SORT) { const k = pkey(l, () => this.setSort(s), { h: 28, tone: 'cream', lamp: 'amber', sound: 'switch' }); so.appendChild(k); this.sortKeys.set(s, k); bindTip(k, () => ({ title: `SORT: ${l}`, desc: tip })); }
    this.q.addEventListener('input', () => { this.query = this.q.value.trim().toLowerCase(); this.fill(); });
    this.q.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { this.q.value = ''; this.query = ''; this.fill(); this.q.blur(); } });
    this.q.addEventListener('focus', () => play('tick', 1, 0.3));
    // the wheel runs the strip sideways
    this.strip.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); this.strip.scrollLeft += (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * 1.2; }, { passive: false });
    this.strip.addEventListener('scroll', () => this.placeThumb());
    this.root.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.strip.addEventListener('pointerdown', (e) => this.down(e));
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp);
    this.syncKeys();
  }
  dispose() { removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); this.pan.dispose(); }

  // ------------------------------------------------------------------ open / close, tabs, filters
  open(cat?: BuildCat) {
    if (cat) this.cat = cat;
    else if (!kindsIn(this.cat).some((k) => buildingLock(this.f.g, k).ok)) { const c = BUILD_CATS.find((x) => kindsIn(x.k).some((k) => buildingLock(this.f.g, k).ok)); if (c) this.cat = c.k; }
    this.isOpen = true;
    this.root.classList.remove('out'); void this.root.offsetWidth;
    this.root.classList.add('on', 'in');
    this.fill(true);
    setTimeout(() => this.root.classList.remove('in'), 1100);
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.endDrag();
    if (this.hot) this.hover(null, null);
    this.q.blur();
    this.root.classList.add('out'); this.root.classList.remove('on');
  }
  setCat(c: BuildCat) {
    if (this.query) { this.q.value = ''; this.query = ''; }
    if (c === this.cat && this.cards.length) return;
    this.cat = c; this.strip.scrollLeft = 0;
    this.fill(false, true);
  }
  private setShow(s: Show) { if (this.show === s) return; this.show = s; this.fill(false, true); }
  private setSort(s: Sort) { if (this.sort === s) return; this.sort = s; this.fill(false, true); }
  private syncKeys() {
    for (const [c, k] of this.tabs) k.setOn(c === this.cat && !this.query);
    for (const [s, k] of this.showKeys) k.setOn(s === this.show);
    for (const [s, k] of this.sortKeys) k.setOn(s === this.sort);
  }
  private tabTip(c: BuildCat) {
    const ks = kindsIn(c), open = ks.filter((k) => buildingLock(this.f.g, k).ok);
    const can = open.filter((k) => !bill(this.f, k).some((l) => l.short));
    return { title: catName(c).toUpperCase(), desc: CAT_DESC[c], rows: [['Buildings', ks.length] as [string, number], ['Unlocked', open.length] as [string, number], ['Affordable now', can.length] as [string, number]], status: open.length ? [`${open.length} of ${ks.length} can be built`, 'ok'] as [string, 'ok'] : ['Locked: unlock it on the skill tree', 'bad'] as [string, 'bad'] };
  }

  // ------------------------------------------------------------------ the cards
  /** what matches the search (every category) or the open tab, through the SHOW filter, in the SORT order */
  private list(): FKind[] {
    const f = this.f, q = this.query;
    let ks: FKind[];
    if (q) {
      ks = BUILD_CATS.flatMap((c) => kindsIn(c.k)).filter((k) => {
        const d = FDEFS[k]; if (!d) return false;
        const outs = d.station ? recipesAt(d.station).flatMap((r) => Object.keys(r.out)) : [];
        const hay = [d.name, d.desc, catName(catOf(k)), ...Object.keys(d.cost).map((id) => ITEMS[id]?.name ?? id), ...outs.map((id) => ITEMS[id]?.name ?? id)].join(' ').toLowerCase();
        return q.split(/\s+/).every((w) => hay.includes(w));
      });
    } else ks = kindsIn(this.cat);
    const ok = (k: FKind) => buildingLock(f.g, k).ok;
    if (this.show === 'ready') ks = ks.filter((k) => ok(k) && !bill(f, k).some((l) => l.short));
    if (this.show === 'locked') ks = ks.filter((k) => !ok(k));
    const base = new Map(ks.map((k, i) => [k, i]));
    const by: Record<Sort, (a: FKind, b: FKind) => number> = {
      cat: (a, b) => Number(!ok(a)) - Number(!ok(b)) || base.get(a)! - base.get(b)!,
      name: (a, b) => FDEFS[a].name.localeCompare(FDEFS[b].name),
      tier: (a, b) => tierOf(a) - tierOf(b) || billSum(a) - billSum(b),
      cost: (a, b) => billSum(a) - billSum(b),
      size: (a, b) => FDEFS[a].w * FDEFS[a].d - FDEFS[b].w * FDEFS[b].d || billSum(a) - billSum(b),
    };
    return [...ks].sort(by[this.sort]);
  }
  /** (re)build the strip; the old cards drop out, the new ones bounce in one after another */
  private fill(first = false, swap = false) {
    const old = [...this.strip.children] as HTMLElement[];
    if (swap) {
      // the old row leaves in place (lifted out of the flow), its cards dropping one after another
      for (const r of old) { r.style.position = 'absolute'; r.style.left = r.offsetLeft + 'px'; r.style.top = r.offsetTop + 'px'; r.style.pointerEvents = 'none'; }
      old.forEach((r) => r.querySelectorAll('.bk-card').forEach((e, i) => { e.classList.add('drop'); (e as HTMLElement).style.setProperty('--i', String(Math.min(i, 8))); }));
      setTimeout(() => old.forEach((e) => e.remove()), 240);
    } else this.strip.innerHTML = '';
    this.cards = [];
    this.syncKeys();
    const ks = this.list(), f = this.f;
    const row = document.createElement('div'); row.className = 'bk-row' + (first ? ' first' : '');
    ks.forEach((k, i) => { const c = new Card(k, this, i); this.cards.push(c); row.appendChild(c.el); });
    if (!ks.length) row.innerHTML = `<div class="bk-none k7-t16">${this.query ? `Nothing matches "${esc(this.query)}". Try a material (ferrite, copper) or a product (ingot, glass).` : this.show === 'ready' ? 'Nothing here can be built from the stores right now: gather more materials, or show ALL.' : this.show === 'locked' ? 'Nothing locked here: everything in this category is open.' : 'Nothing in this category yet.'}</div>`;
    this.strip.appendChild(row);
    // the header: the category (or the search), what it is for, its counts
    const all = this.query ? ks : kindsIn(this.cat), open = all.filter((k) => buildingLock(f.g, k).ok), can = open.filter((k) => !bill(f, k).some((l) => l.short));
    const title = this.query ? `SEARCH: "${this.query.toUpperCase()}"` : catName(this.cat).toUpperCase();
    this.head.innerHTML = `<span class="bk-head-t k7-t16">${esc(title)}</span><span class="bk-head-r k7-t16">${all.length} building${all.length === 1 ? '' : 's'}  ·  ${open.length} unlocked  ·  ${can.length} affordable now${ks.length !== all.length ? `  ·  ${ks.length} shown` : ''}</span>`;
    this.sub.textContent = this.query ? `Across every category: ${[...new Set(ks.map((k) => catName(catOf(k))))].join(', ') || 'none'}.` : `${CAT_DESC[this.cat]} Click a card to take it in hand, or drag it onto the map.`;
    this.head.classList.remove('flash'); void this.head.offsetWidth; this.head.classList.add('flash');
    this.lockKey = this.locks();
    this.counts();
    requestAnimationFrame(() => this.placeThumb());
  }
  private locks() { return BUILD_CATS.map((c) => kindsIn(c.k).map((k) => (buildingLock(this.f.g, k).ok ? 1 : 0)).join('')).join('|'); }
  /** the tabs' counts and lamps */
  private counts() {
    for (const c of BUILD_CATS) {
      const ks = kindsIn(c.k), open = ks.filter((k) => buildingLock(this.f.g, k).ok).length;
      const n = this.tabN.get(c.k)!;
      n.textContent = String(ks.length);
      const k = this.tabs.get(c.k)!;
      k.classList.toggle('dead', !open);
      n.title = `${open} of ${ks.length} unlocked`;
    }
  }
  private placeThumb() {
    const s = this.strip, W = s.scrollWidth, w = s.clientWidth;
    this.track.classList.toggle('on', W > w + 4);
    if (W <= w + 4) return;
    const tw = Math.max(40, (w / W) * this.track.clientWidth), x = (s.scrollLeft / (W - w)) * (this.track.clientWidth - tw);
    this.thumb.style.width = Math.round(tw) + 'px'; this.thumb.style.left = Math.round(x) + 'px';
  }
  /** the detail card follows this */
  onHover?: (k: FKind | null) => void;
  hover(k: FKind | null, _c: Card | null) { this.hot = k; this.onHover?.(k); }
  cardOf(kind: FKind) { return this.cards.find((c) => c.kind === kind) ?? null; }
  /** a building was placed from this card */
  placed(kind: FKind) { this.cardOf(kind)?.ping(); }
  /** is a screen point over the catalogue */
  over(x: number, y: number) { const r = this.root.getBoundingClientRect(); return this.isOpen && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }

  // ------------------------------------------------------------------ drag and drop
  private down(e: PointerEvent) {
    if (e.button !== 0) return;
    const el = (e.target as HTMLElement).closest('.bk-card') as HTMLElement | null; if (!el) return;
    const c = this.cards.find((x) => x.el === el); if (!c) return;
    e.preventDefault();
    if (!c.lock.ok) { c.shake(); play('deny', 1, 0.45); this.setPick(c.kind); return; }
    this.drag = { kind: c.kind, card: c, x: e.clientX, y: e.clientY, on: false, out: false, ghost: null };
  }
  /** the picked card (brass, lit): clicked, dragged, or the building in hand */
  setPick(k: FKind | null) {
    if (k === this.pick) return;
    const was = this.pick; this.pick = k;
    for (const c of this.cards) if (c.kind === k || c.kind === was) { c.el.classList.toggle('picked', c.kind === k); c.repaint(); }
  }
  private onMove = (e: PointerEvent) => {
    const d = this.drag; if (!d) return;
    if (!d.on && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) {
      d.on = true;
      d.ghost = document.createElement('div'); d.ghost.className = 'bk-drag';
      d.ghost.innerHTML = `<img src="${art(d.kind)}" alt="">`;
      document.body.appendChild(d.ghost);
      d.card.el.classList.add('lifted');
      this.setPick(d.kind);
      play('lift', 1, 0.5);
    }
    if (!d.on || !d.ghost) return;
    const over = this.host.overUi(e.clientX, e.clientY);
    d.ghost.style.left = e.clientX + 'px'; d.ghost.style.top = e.clientY + 'px';
    if (!over && !d.out) { d.out = true; d.ghost.classList.add('out'); this.host.dragStart(d.kind); }
    if (over && d.out) d.ghost.classList.remove('out');
    if (d.out) this.host.dragMove(e.clientX, e.clientY, over);
  };
  private onUp = (e: PointerEvent) => {
    const d = this.drag; if (!d) return;
    this.drag = null;
    d.card.el.classList.remove('lifted');
    if (!d.on) { d.ghost?.remove(); if (e.button === 0) { this.setPick(d.kind); this.host.take(d.kind); d.card.ping(); } return; }
    const over = this.host.overUi(e.clientX, e.clientY);
    if (d.ghost) {
      // back onto the panels: it flies home; onto the map: it is gone into the ghost
      const g = d.ghost;
      if (over || !d.out) { const r = d.card.imgEl.getBoundingClientRect(); g.classList.remove('out'); g.classList.add('home'); g.style.left = r.left + r.width / 2 + 'px'; g.style.top = r.top + r.height / 2 + 'px'; setTimeout(() => g.remove(), 260); }
      else g.remove();
    }
    if (d.out) this.host.dragEnd(e.clientX, e.clientY, over);
  };
  private endDrag() { if (this.drag) { this.drag.ghost?.remove(); this.drag.card.el.classList.remove('lifted'); this.drag = null; } }

  update(dt: number) {
    if (!this.isOpen) return;
    this.t += dt;
    budget = 2;
    for (const c of this.cards) c.update(dt);
    const sec = Math.floor(this.t) !== Math.floor(this.t - dt);
    // research finished while the catalogue is up: rebuild; the stores changed: the bills and lamps follow
    if (sec && this.locks() !== this.lockKey) this.fill();
    else if (Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2)) for (const c of this.cards) c.refresh();
  }
}
