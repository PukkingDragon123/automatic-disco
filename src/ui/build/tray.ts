// THE BUILD TRAY (blueprint build mode): a city-builder tray along the bottom of the blueprint. No boxes and no tiles:
// a steel PARALLEL RULE hangs across the bottom with a brass slide-rule CURSOR that slides to the open category; the
// categories float on the rule as small painted miniatures of their flagship building, their short names engraved
// into the steel; above them the category's buildings float as detailed outlined MINIATURES (painted from real renders
// of each model) over soft shadows, bobbing. Under the pointer a miniature lifts and turns right round on its own
// turntable (live frames of its model, inked), its name floats under it and its bill floats over it as item icons with
// have / need. LOCKED ones hang dimmed with a padlock and the icon of what unlocks them. Drag one onto the map (or click
// it to take it in hand); a category change drops the old row out and bounces the new one in.
import type { Factory } from '../../factory/factory';
import { FDEFS, type FKind } from '../../factory/defs';
import { ITEMS, itemIcon, type ItemId } from '../../factory/items';
import { BUILD_CATS, kindsIn, registerColonyBuildings, type BuildCat } from '../../logistics/catalog';
import { buildingLock, type Lock } from '../../logistics/unlocks';
import { art } from './art';
import { spinFrame } from './studio';
import { bpIcon, floatBtn, type BpIcon } from './bpicons';
import { parallelRule, ruleCursor } from './paper';
import { play } from './juice';

/** the flagship of each category (its miniature floats on the rule) */
const FLAG: Record<BuildCat, FKind[]> = {
  extraction: ['miner1'], storage: ['st_bin', 'crate', 'silo'], logistics: ['splitter', 'belt1'], processing: ['smelter'], power: ['steamgen', 'boiler'],
  bio: ['cropplot', 'shed'], research: ['lab'], defence: ['turret'], habitat: ['bunkhouse', 'barracks'], decor: ['flagpole', 'floodlight'],
};
const LOCK_ICON: Record<Lock['by'], BpIcon> = { research: 'flask', mastery: 'star', skill: 'star', discipline: 'jack', '': 'lock' };
const FRAMES = 24;
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));

export interface TrayHost {
  /** a click: take the building in hand */
  take(kind: FKind): void;
  /** a miniature dragged out of the tray (over the map), moved, released */
  dragStart(kind: FKind): void;
  dragMove(x: number, y: number, overTray: boolean): void;
  dragEnd(x: number, y: number, overTray: boolean): void;
  /** the exit icon */
  leave(): void;
  /** have / need for a building */
  bill(kind: FKind): [ItemId, number, number][];
}

// ------------------------------------------------------------------ turntable frames (shared, rendered lazily)
const reels = new Map<FKind, (HTMLCanvasElement | null)[]>();
let budget = 0;
function reelFrame(kind: FKind, i: number): HTMLCanvasElement | null {
  let r = reels.get(kind);
  if (!r) reels.set(kind, (r = new Array(FRAMES).fill(null)));
  if (!r[i] && budget > 0) { budget--; r[i] = spinFrame(kind, 64, 48, (i / FRAMES) * Math.PI * 2); }
  return r[i];
}

class Mini {
  readonly el: HTMLDivElement;
  private cv: HTMLCanvasElement; private g: CanvasRenderingContext2D;
  private img: HTMLImageElement;
  hot = false; ang = 0; private spin = 0; private cur = -1;
  lock: Lock;
  constructor(readonly kind: FKind, readonly tray: BuildTray, i: number) {
    const d = FDEFS[kind];
    this.lock = buildingLock(tray.f.g, kind);
    const el = (this.el = document.createElement('div'));
    el.className = 'bt-mini' + (this.lock.ok ? '' : ' locked');
    el.dataset.kind = kind;
    el.style.setProperty('--i', String(i));
    el.style.setProperty('--ph', (Math.random() * -4).toFixed(2) + 's');
    el.innerHTML = `<span class="bt-cost"></span><span class="bt-sh"></span><span class="bt-bob"><img class="bt-art" src="${art(kind)}" alt="" draggable="false"><canvas class="bt-spin" width="64" height="48"></canvas>${this.lock.ok ? '' : `<span class="bt-lock"><img src="${bpIcon('lock')}" alt=""><img class="bt-req" src="${bpIcon(LOCK_ICON[this.lock.by])}" alt=""></span>`}</span><span class="bt-name">${esc(d.name)}</span>${this.lock.ok ? '' : `<span class="bt-why">${esc(this.lock.why)}</span>`}`;
    this.cv = el.querySelector('canvas')!; this.g = this.cv.getContext('2d')!; this.g.imageSmoothingEnabled = false;
    this.img = el.querySelector('.bt-art')!;
    el.addEventListener('pointerenter', () => this.setHot(true));
    el.addEventListener('pointerleave', () => this.setHot(false));
  }
  setHot(on: boolean) {
    if (this.hot === on) return;
    this.hot = on;
    this.el.classList.toggle('hot', on);
    if (on) { play('tick', 1.2, 0.22); this.tray.renderCost(this); }
  }
  update(dt: number) {
    // hot: it turns right round; cold: it eases back to face front, then the painted art takes over again
    if (this.hot && this.lock.ok) this.spin = Math.min(1, this.spin + dt * 4);
    else this.spin = Math.max(0, this.spin - dt * 2.5);
    if (this.hot && this.lock.ok) this.ang += dt * 2.6;
    else { const TAU = Math.PI * 2, r = ((this.ang % TAU) + TAU) % TAU; this.ang = r > Math.PI ? r + (TAU - r) * Math.min(1, dt * 5) : r * (1 - Math.min(1, dt * 5)); }
    const live = this.spin > 0.01 && (Math.abs(Math.sin(this.ang / 2)) > 0.02 || this.hot);
    this.el.classList.toggle('spin', live);
    if (!live) return;
    const i = ((Math.round((this.ang / (Math.PI * 2)) * FRAMES) % FRAMES) + FRAMES) % FRAMES;
    if (i === this.cur) return;
    const fr = reelFrame(this.kind, i);
    if (!fr) return;
    this.cur = i;
    this.g.clearRect(0, 0, 64, 48); this.g.drawImage(fr, 0, 0);
  }
  /** a quick bob (the building was placed from this miniature) */
  ping() { this.el.classList.remove('ping'); void this.el.offsetWidth; this.el.classList.add('ping'); }
  /** shake (locked, or nothing to pay with) */
  shake() { this.el.classList.remove('shake'); void this.el.offsetWidth; this.el.classList.add('shake'); }
  get imgEl() { return this.img; }
}

export class BuildTray {
  readonly root: HTMLDivElement;
  private rail: HTMLCanvasElement; private cursor: HTMLCanvasElement;
  private cats: HTMLDivElement; private shelf: HTMLDivElement;
  private catEls = new Map<BuildCat, HTMLElement>();
  private minis: Mini[] = [];
  cat: BuildCat = 'extraction';
  isOpen = false;
  private railW = 0;
  private drag: { kind: FKind; mini: Mini; x: number; y: number; on: boolean; out: boolean; ghost: HTMLDivElement | null } | null = null;
  private key = '';
  private t = 0;

  constructor(readonly f: Factory, readonly host: TrayHost) {
    registerColonyBuildings();
    const r = (this.root = document.createElement('div'));
    r.className = 'bt';
    r.innerHTML = `<canvas class="bt-rail"></canvas><canvas class="bt-cur"></canvas><div class="bt-cats"></div><div class="bt-shelf"></div>`;
    document.body.appendChild(r);
    this.rail = r.querySelector('.bt-rail')!; this.cursor = r.querySelector('.bt-cur')!;
    this.cats = r.querySelector('.bt-cats')!; this.shelf = r.querySelector('.bt-shelf')!;
    ruleCursor(32).canvas(this.cursor);
    for (const c of BUILD_CATS) {
      const fk = FLAG[c.k].find((k) => FDEFS[k]) ?? kindsIn(c.k)[0];
      const b = floatBtn(fk ? art(fk, 'small') : bpIcon('cog'), '', () => this.setCat(c.k), { size: 64, cls: 'bt-cat', sound: 'turn' });
      b.dataset.cat = c.k;
      const t = document.createElement('span'); t.className = 'bt-cat-t'; t.textContent = c.short; b.appendChild(t);
      this.cats.appendChild(b); this.catEls.set(c.k, b);
    }
    const ex = floatBtn('exit', '', () => host.leave(), { size: 48, cls: 'bt-exit', sound: 'close' });
    r.appendChild(ex);
    for (const e of [this.cats, this.shelf]) { e.addEventListener('wheel', (ev) => { ev.stopPropagation(); if (e === this.cats) this.wheelCat(ev.deltaY); }, { passive: true }); }
    r.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.shelf.addEventListener('pointerdown', (e) => this.down(e));
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp);
    addEventListener('resize', this.paintRail);
    this.paintRail();
  }
  dispose() { removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); removeEventListener('resize', this.paintRail); this.root.remove(); }
  private paintRail = () => {
    const w = Math.max(80, Math.floor((innerWidth - 48) / 2));
    if (w === this.railW) return;
    this.railW = w;
    parallelRule(w).canvas(this.rail);
    this.rail.style.width = w * 2 + 'px'; this.rail.style.height = this.rail.height * 2 + 'px';
    this.placeCursor();
  };
  private placeCursor() {
    const b = this.catEls.get(this.cat); if (!b) return;
    const rr = this.root.getBoundingClientRect(), br = b.getBoundingClientRect();
    if (!br.width) return;
    this.cursor.style.left = Math.round((br.left + br.width / 2 - rr.left) / 2) * 2 - 32 + 'px';
  }
  private wheelCat(dy: number) { const i = BUILD_CATS.findIndex((c) => c.k === this.cat), n = BUILD_CATS.length; this.setCat(BUILD_CATS[(i + (dy > 0 ? 1 : n - 1)) % n].k); }

  open(cat?: BuildCat) {
    if (cat) this.cat = cat;
    this.isOpen = true;
    this.root.classList.remove('out'); void this.root.offsetWidth;
    this.root.classList.add('on', 'in');
    this.fill(true);
    setTimeout(() => this.root.classList.remove('in'), 900);
    requestAnimationFrame(() => this.placeCursor());
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.endDrag();
    this.root.classList.add('out');
    this.root.classList.remove('on');
  }
  setCat(c: BuildCat) {
    if (c === this.cat && this.minis.length) { this.catEls.get(c)?.classList.add('on'); return; }
    this.cat = c;
    // the old row drops out, the new one bounces in
    const old = [...this.shelf.children] as HTMLElement[];
    old.forEach((e, i) => { e.classList.add('drop'); e.style.setProperty('--i', String(i)); });
    setTimeout(() => old.forEach((e) => e.remove()), 260);
    this.fill(false, true);
    this.placeCursor();
  }
  /** (re)build the shelf for the open category */
  private fill(first: boolean, keepOld = false) {
    if (!keepOld) this.shelf.innerHTML = '';
    this.minis = [];
    for (const [k, e] of this.catEls) e.classList.toggle('on', k === this.cat);
    const kinds = kindsIn(this.cat);
    // unlocked first, in catalogue order
    const sorted = [...kinds].sort((a, b) => Number(!buildingLock(this.f.g, a).ok) - Number(!buildingLock(this.f.g, b).ok));
    const row = document.createElement('div'); row.className = 'bt-row' + (first ? ' first' : '');
    row.style.setProperty('--n', String(sorted.length));
    if (sorted.length > 12) row.classList.add('tight');
    sorted.forEach((k, i) => { const m = new Mini(k, this, i); this.minis.push(m); row.appendChild(m.el); });
    this.shelf.appendChild(row);
    this.key = this.lockKey();
  }
  private lockKey() { return kindsIn(this.cat).map((k) => (buildingLock(this.f.g, k).ok ? 1 : 0)).join(''); }
  /** the bill floats over a hot miniature: icon, have / need */
  renderCost(m: Mini) {
    const el = m.el.querySelector('.bt-cost') as HTMLElement;
    if (!m.lock.ok) { el.innerHTML = ''; return; }
    el.innerHTML = this.host.bill(m.kind).map(([id, have, need]) => `<span class="bp-chip ${have < need ? 'lack' : ''}" title="${esc(ITEMS[id]?.name ?? id)}"><img src="${itemIcon(id, 32)}" alt=""><b>${Math.min(999, Math.floor(have))}</b><i>/${need}</i></span>`).join('');
  }
  miniOf(kind: FKind) { return this.minis.find((m) => m.kind === kind) ?? null; }
  /** the screen box a building's miniature is in (for the drop's fly-back) */
  rectOf(kind: FKind) { return this.miniOf(kind)?.imgEl.getBoundingClientRect() ?? null; }
  /** is a screen point over the tray's own things (not the open blueprint above it) */
  over(x: number, y: number) {
    const el = document.elementFromPoint(x, y);
    return !!el && this.root.contains(el) && el !== this.root;
  }

  // ------------------------------------------------------------------ drag and drop
  private down(e: PointerEvent) {
    if (e.button !== 0) return;
    const el = (e.target as HTMLElement).closest('.bt-mini') as HTMLElement | null; if (!el) return;
    const m = this.minis.find((x) => x.el === el); if (!m) return;
    e.preventDefault();
    if (!m.lock.ok) { m.shake(); play('deny', 1, 0.45); return; }
    this.drag = { kind: m.kind, mini: m, x: e.clientX, y: e.clientY, on: false, out: false, ghost: null };
  }
  private onMove = (e: PointerEvent) => {
    const d = this.drag; if (!d) return;
    if (!d.on && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) {
      d.on = true;
      d.ghost = document.createElement('div'); d.ghost.className = 'bt-drag';
      d.ghost.innerHTML = `<img src="${art(d.kind)}" alt="">`;
      document.body.appendChild(d.ghost);
      d.mini.el.classList.add('lifted');
      play('lift', 1, 0.5);
    }
    if (!d.on || !d.ghost) return;
    const overTray = this.over(e.clientX, e.clientY) || e.clientY > innerHeight - 110;
    d.ghost.style.left = e.clientX + 'px'; d.ghost.style.top = e.clientY + 'px';
    if (!overTray && !d.out) { d.out = true; d.ghost.classList.add('out'); this.host.dragStart(d.kind); }
    if (overTray && d.out) d.ghost.classList.remove('out');
    if (d.out) this.host.dragMove(e.clientX, e.clientY, overTray);
  };
  private onUp = (e: PointerEvent) => {
    const d = this.drag; if (!d) return;
    this.drag = null;
    d.mini.el.classList.remove('lifted');
    if (!d.on) { d.ghost?.remove(); if (e.button === 0) { this.host.take(d.kind); d.mini.ping(); } return; }
    const overTray = this.over(e.clientX, e.clientY) || e.clientY > innerHeight - 110;
    if (d.ghost) {
      // back to the tray: it flies home; onto the map: it is gone into the hologram
      const g = d.ghost;
      if (overTray || !d.out) { const r = d.mini.imgEl.getBoundingClientRect(); g.classList.remove('out'); g.classList.add('home'); g.style.left = r.left + r.width / 2 + 'px'; g.style.top = r.top + r.height / 2 + 'px'; setTimeout(() => g.remove(), 260); }
      else g.remove();
    }
    if (d.out) this.host.dragEnd(e.clientX, e.clientY, overTray);
  };
  private endDrag() { if (this.drag) { this.drag.ghost?.remove(); this.drag.mini.el.classList.remove('lifted'); this.drag = null; } }

  update(dt: number) {
    if (!this.isOpen) return;
    this.t += dt;
    budget = 2;
    for (const m of this.minis) m.update(dt);
    // locks open while the tray is up (research finished): rebuild the row
    if (Math.floor(this.t) !== Math.floor(this.t - dt) && this.lockKey() !== this.key) this.fill(false);
    // keep a hot miniature's bill current
    if (Math.floor(this.t * 4) !== Math.floor((this.t - dt) * 4)) for (const m of this.minis) if (m.hot) this.renderCost(m);
  }
}
