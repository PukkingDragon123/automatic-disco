// The CONSTRUCTION PLANNER (B): the build menu, Techtonica-style, in the green machine UI. Ten category keys along
// the top, each a phosphor silhouette of the section's flagship machine; a glass of tiles (a studio render, the
// name, power and throughput, the cost in real items as have/need, the lock and what lifts it); and a detail sheet
// for the selected building (a turntable render, footprint with its faces, power, throughput, the bill of materials,
// every recipe with its rate, and the construction steps). Click a tile to place it; drag it onto the hotbar.
import './build.css';
import type { Factory } from '../../factory/factory';
import type { Build } from '../../factory/build';
import { FDEFS, type FKind, type FDef } from '../../factory/defs';
import { ITEMS, itemIcon, type ItemId } from '../../factory/items';
import { recipesAt, perMin, type Recipe } from '../../factory/recipes';
import { BUILD_CATS, catOf, kindsIn, workOf, registerColonyBuildings, type BuildCat } from '../../logistics/catalog';
import { buildingLock, mod } from '../../logistics/unlocks';
import { registerChains } from '../../logistics/recipes';
import { still, turntable, phosphor } from './studio';
import { installHW, paintHW } from './hw';
import { el, ui } from '../kit';
import { sfx } from '../../audio/audio';

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
const fmt = (n: number) => (n >= 100 ? Math.round(n).toString() : n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, ''));
/** the flagship of each section: its silhouette is the category key */
const FLAG: Record<BuildCat, FKind[]> = {
  extraction: ['miner1'], storage: ['silo', 'crate'], logistics: ['splitter', 'belt1'], processing: ['smelter'], power: ['steamgen', 'boiler'],
  bio: ['cropplot', 'shed'], research: ['lab'], defence: ['turret'], habitat: ['bunkhouse', 'barracks'], decor: ['flagpole', 'floodlight'],
};
/** the key labels (Spleen at 24 px: twelve characters to a key) */
const SHORT: Record<BuildCat, string> = { extraction: 'EXTRACTION', storage: 'STORAGE', logistics: 'LOGISTICS', processing: 'PROCESSING', power: 'POWER', bio: 'BIO-ENG', research: 'RESEARCH', defence: 'DEFENCE', habitat: 'HABITAT', decor: 'DECOR' };
const LETTER: Record<BuildCat, string> = { extraction: 'A', storage: 'B', logistics: 'C', processing: 'D', power: 'E', bio: 'F', research: 'G', defence: 'H', habitat: 'J', decor: 'K' };
/** an item with have/need (or just the need): its icon and the numbers in Body 11 (`big`: Body 22) */
export const chip = (id: ItemId, have: number | null, need: number, big = false) => {
  const lack = have !== null && have < need;
  return `<span class="pl-chip ${lack ? 'lack' : ''} ${big ? 'big' : ''}" title="${esc(ITEMS[id]?.name ?? id)}"><img src="${itemIcon(id, 44)}" alt=""><b>${have === null ? need : fmt(Math.min(have, 9999))}</b>${have === null ? '' : `<i>/${need}</i>`}</span>`;
};

export class BuildMenu {
  readonly root: HTMLDivElement;
  private tabs: HTMLDivElement; private grid: HTMLDivElement; private det: HTMLDivElement; private foot: HTMLDivElement;
  private q: HTMLInputElement;
  tab: BuildCat = 'extraction';
  sel: FKind | null = 'miner1';
  hover: FKind | null = null;
  isOpen = false;
  private gridKey = ''; private detKey = '';
  private spin = 0; private stage: HTMLCanvasElement | null = null; private spinT = 0;
  private drag: { kind: FKind; x: number; y: number; on: boolean; ghost: HTMLDivElement | null } | null = null;

  constructor(readonly f: Factory, readonly b: Build) {
    registerColonyBuildings();
    installHW();
    const r = (this.root = el('div', 'pl-house bm', ui()));
    r.dataset.hw = 'house'; r.dataset.seed = '7'; r.dataset.seams = JSON.stringify({ y: [78] });
    const head = el('div', 'bm-head', r);
    head.innerHTML = `<span class="pl-stencil">CONSTRUCTION PLANNER</span><span class="sub pl-s">UNAA COLONY WORKS<br>UNIT 07 · FIELD ISSUE</span><span class="sp"></span>`;
    const sb = el('label', 'bm-search', head);
    sb.dataset.hw = 'well'; sb.dataset.seed = '4';
    el('span', 'pr', sb, '&gt;');
    this.q = el('input', '', sb); this.q.placeholder = 'SEARCH'; this.q.spellcheck = false;
    el('span', 'pl-btn bm-x', head, 'CLOSE <span class="pl-key">B</span>').title = 'Close';
    this.tabs = el('div', 'bm-tabs', r);
    const body = el('div', 'bm-body', r);
    this.grid = el('div', 'pl-glass bm-grid', body); this.grid.dataset.hw = 'glass'; this.grid.dataset.seed = '2'; this.grid.dataset.well = '1';
    this.det = el('div', 'pl-glass bm-det', body); this.det.dataset.hw = 'glass'; this.det.dataset.seed = '5'; this.det.dataset.well = '1';
    this.foot = el('div', 'bm-foot pl-s', r);
    r.addEventListener('pointerdown', (e) => e.stopPropagation());
    r.addEventListener('wheel', (e) => e.stopPropagation());
    head.querySelector('.bm-x')!.addEventListener('click', () => this.b.close());
    this.q.addEventListener('input', () => { this.gridKey = ''; this.renderGrid(); });
    this.q.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { this.q.value = ''; this.q.blur(); this.gridKey = ''; this.renderGrid(); } if (e.key === 'Enter') { const first = this.visible().find((k) => buildingLock(f.g, k).ok); if (first) this.b.choose(first); } });
    this.tabs.addEventListener('wheel', (e) => { const i = BUILD_CATS.findIndex((c) => c.k === this.tab), n = BUILD_CATS.length; this.setTab(BUILD_CATS[(i + (e.deltaY > 0 ? 1 : n - 1)) % n].k); });
    this.grid.addEventListener('pointerdown', (e) => this.tileDown(e));
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp);
  }
  dispose() { removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); this.root.remove(); }

  open() {
    if (this.isOpen) return;
    registerChains();
    this.isOpen = true; this.root.classList.add('on');
    this.gridKey = ''; this.detKey = '';
    this.renderTabs(); this.renderGrid(); this.renderDet(); this.renderFoot();
    requestAnimationFrame(() => paintHW(this.root));
    sfx('open', 1.1, 0.5);
  }
  close() { if (!this.isOpen) return; this.isOpen = false; this.root.classList.remove('on'); this.q.blur(); this.endDrag(); }
  setTab(t: BuildCat) { if (t === this.tab && !this.q.value) return; this.tab = t; this.q.value = ''; this.gridKey = ''; const first = kindsIn(t)[0]; if (first) this.sel = first; sfx('click', 1.25, 0.45); this.renderTabs(); this.renderGrid(); this.renderDet(); }
  select(k: FKind) { this.sel = k; this.detKey = ''; this.renderGrid(true); this.renderDet(); }

  /** the kinds the glass shows (a search spans every section) */
  private visible(): FKind[] {
    const q = this.q.value.trim().toLowerCase();
    if (q) return BUILD_CATS.flatMap((c) => kindsIn(c.k)).filter((k) => FDEFS[k].name.toLowerCase().includes(q) || FDEFS[k].desc.toLowerCase().includes(q));
    return kindsIn(this.tab);
  }
  private have(id: ItemId) { return this.f.sites ? this.f.sites.avail(id) : this.f.count(id); }
  private cost(d: FDef) { return this.f.sites ? this.f.sites.costOf(d) : d.cost; }

  // ------------------------------------------------------------------ category keys
  private renderTabs() {
    const g = this.f.g;
    this.tabs.innerHTML = BUILD_CATS.map((c) => {
      const ks = kindsIn(c.k), open = ks.filter((k) => buildingLock(g, k).ok).length;
      const flag = FLAG[c.k].find((k) => FDEFS[k]) ?? ks[0];
      const img = flag ? phosphor(flag, 60, 26) : '';
      return `<div class="bm-tab ${c.k === this.tab && !this.q.value ? 'on' : ''}" data-tab="${c.k}" title="${esc(c.name)}"><div class="win">${img ? `<img src="${img}" alt="">` : ''}</div><div class="nm">${SHORT[c.k]}</div><div class="ct">${open}/${ks.length}</div></div>`;
    }).join('');
    this.tabs.querySelectorAll<HTMLElement>('[data-tab]').forEach((e) => e.addEventListener('click', () => this.setTab(e.dataset.tab as BuildCat)));
  }

  // ------------------------------------------------------------------ tiles
  private renderGrid(force = false) {
    const g = this.f.g, ks = this.visible();
    const slots = this.b.hotbar?.slots ?? [];
    const key = `${this.tab}|${this.q.value}|${this.sel}|${ks.join(',')}|${slots.join(',')}|` + ks.map((k) => { const d = FDEFS[k]; return buildingLock(g, k).ok + ':' + Object.keys(d.cost).map((id) => Math.min(9999, this.have(id))).join(':'); }).join(';');
    if (key === this.gridKey && !force) return;
    this.gridKey = key;
    const ready = ks.filter((k) => buildingLock(g, k).ok), locked = ks.filter((k) => !buildingLock(g, k).ok);
    const tile = (k: FKind) => {
      const d = FDEFS[k], lk = buildingLock(g, k), c = this.cost(d);
      const idx = kindsIn(catOf(k)).indexOf(k) + 1;
      const poor = Object.entries(c).some(([id, n]) => this.have(id) < (n ?? 0));
      const slot = slots.indexOf(k);
      const spec: string[] = [];
      if (d.power > 0) spec.push(`<span class="pw">${fmt(d.power * mod(g, 'power.draw'))} MW</span>`); else if (d.power < 0) spec.push(`<span class="gen">+${fmt(-d.power * mod(g, 'power.out'))} MW</span>`);
      const tp = this.throughput(d); if (tp) spec.push(tp);
      return `<div class="bm-tile ${this.sel === k ? 'sel' : ''} ${lk.ok ? '' : 'locked'} ${poor && lk.ok ? 'poor' : ''}" data-kind="${k}">
        <div class="pic"><span class="no pl-s">${LETTER[catOf(k)]}-${String(idx).padStart(2, '0')}</span><span class="fp pl-s">${d.w}×${d.d} M</span><img src="${still(k, 104, 60)}" alt="" draggable="false">${slot >= 0 ? `<span class="pl-key hk">${(slot + 1) % 10}</span>` : ''}</div>
        <div class="nm">${esc(d.name.toUpperCase())}</div>
        <div class="spec pl-s">${spec.join(' · ') || '&nbsp;'}</div>
        <div class="cost">${Object.entries(c).map(([id, n]) => chip(id, this.have(id), n ?? 0)).join('')}</div>
        ${lk.ok ? '' : `<div class="lock pl-s"><b>LOCKED</b>${esc(lk.why)}</div>`}
      </div>`;
    };
    let h = '';
    if (!ks.length) h = `<div class="bm-empty">${this.q.value ? 'NO BUILDING MATCHES THAT SEARCH' : 'NOTHING IN THIS SECTION YET'}</div>`;
    else {
      h += `<div class="bm-sec"><b>${this.q.value ? 'SEARCH' : BUILD_CATS.find((c) => c.k === this.tab)!.name.toUpperCase()}</b><span class="pl-s">READY TO BUILD · ${ready.length}</span></div>`;
      h += ready.map(tile).join('');
      if (locked.length) h += `<div class="bm-sec"><b>NOT YET LEARNED</b><span class="pl-s">${locked.length}</span></div>` + locked.map(tile).join('');
    }
    const st = this.grid.scrollTop;
    this.grid.innerHTML = h;
    this.grid.scrollTop = st;
    this.grid.querySelectorAll<HTMLElement>('[data-kind]').forEach((e) => {
      e.addEventListener('pointerenter', () => { this.hover = e.dataset.kind as FKind; });
      e.addEventListener('pointerleave', () => { if (this.hover === e.dataset.kind) this.hover = null; });
      e.addEventListener('dblclick', () => this.b.choose(e.dataset.kind as FKind));
    });
  }
  /** one line of what a building moves or makes */
  throughput(d: FDef): string {
    const g = this.f.g;
    if (d.extract) return `${fmt((d.rate ?? 0) * 60 * mod(g, 'mine.rate'))}/min`;
    if (d.belt) return `${Math.round(d.belt * 180 * mod(g, 'belt.speed'))}/min`;
    if (d.store) return `HOLDS ${d.store}`;
    if (d.station) { const rs = recipesAt(d.station); if (rs.length) return `${rs.length} RECIPE${rs.length > 1 ? 'S' : ''}`; }
    if (d.radius) return `${d.radius} m REACH`;
    return '';
  }

  // ------------------------------------------------------------------ detail sheet
  private renderDet() {
    const k = this.sel && FDEFS[this.sel] ? this.sel : null, g = this.f.g;
    if (!k) { this.det.innerHTML = `<div class="bm-empty">SELECT A BUILDING</div>`; this.stage = null; return; }
    const d = FDEFS[k], lk = buildingLock(g, k), c = this.cost(d);
    const key = `${k}|${lk.ok}|${Object.keys(c).map((id) => this.have(id)).join(',')}|${(this.b.hotbar?.slots ?? []).indexOf(k)}`;
    if (key === this.detKey) return;
    const keepStage = this.detKey.split('|')[0] === k && this.stage;
    this.detKey = key;
    const cat = BUILD_CATS.find((x) => x.k === catOf(k))!;
    const work = workOf(d) / mod(g, 'build.speed'), crew = Math.max(1, Math.min(4, Math.round(d.w * d.d / 3)));
    const loads = Object.values(c).reduce((a: number, n) => a + Math.ceil((n ?? 0) / 8), 0);
    const stat = (kk: string, v: string, cls = '') => `<div class="bm-stat pl-ph"><div class="k pl-s">${kk}</div><div class="v ${cls}">${v}</div></div>`;
    let h = `<div class="stage"><span class="tag pl-s">${LETTER[cat.k]}-${String(kindsIn(cat.k).indexOf(k) + 1).padStart(2, '0')} · ${cat.name.toUpperCase()}</span><canvas class="tt" width="268" height="116"></canvas><canvas class="fpd" width="1" height="1"></canvas></div>`;
    h += `<div class="hd"><div class="nm">${esc(d.name.toUpperCase())}</div><div class="cl pl-s">${d.w}×${d.d} M FOOTPRINT · ${fmt(d.h)} M TALL · HULL ${d.hp}</div><div class="ds">${esc(d.desc)}</div></div>`;
    h += `<div class="scroll">`;
    h += `<div class="bm-stats">`;
    h += stat('POWER MW', d.power > 0 ? `${fmt(d.power * mod(g, 'power.draw'))}` : d.power < 0 ? `+${fmt(-d.power * mod(g, 'power.out'))}` : 'NONE', d.power < 0 ? 'gen' : '');
    h += stat('THROUGHPUT', this.throughput(d) || 'NONE');
    h += stat('WORK CREW-S', `${Math.round(work)}`);
    h += stat('CREW MAX', `${crew}`);
    h += `</div>`;
    // bill of materials
    h += `<div class="lbl pl-s">BILL OF MATERIALS <i>NEEDED · FREE IN STORES</i></div><table class="bm-bom">`;
    for (const [id, n] of Object.entries(c)) {
      const have = this.have(id), need = n ?? 0, segs = 12, on = Math.min(segs, Math.floor((have / Math.max(1, need)) * segs));
      h += `<tr class="${have < need ? 'lack' : ''}"><td><span class="pl-chip big"><img src="${itemIcon(id, 44)}" alt=""></span> ${esc((ITEMS[id]?.name ?? id).toUpperCase())}<span class="bar">${Array.from({ length: segs }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</span></td><td class="n">${need}</td><td class="h">${fmt(Math.min(have, 99999))}</td></tr>`;
    }
    if (!Object.keys(c).length) h += `<tr><td colspan="3">NO MATERIALS</td></tr>`;
    h += `</table>`;
    // recipes
    if (d.station) {
      const rs = recipesAt(d.station);
      h += `<div class="lbl pl-s">RECIPES <i>${rs.length} · CYCLE · OUTPUT PER MINUTE</i></div>`;
      if (!rs.length) h += `<div class="bm-rec pl-ph"><span class="nm pl-s">NO RECIPES YET: THEIR MATERIALS ARE NOT IN THE CATALOGUE</span></div>`;
      for (const r of rs) h += this.recipe(r);
    }
    if (d.extract) h += `<div class="lbl pl-s">EXTRACTS <i>${fmt((d.rate ?? 0) * 60 * mod(g, 'mine.rate'))} LOADS/MIN</i></div><div class="bm-rec pl-ph"><span class="nm pl-s">${d.extract === 'node' ? 'SITS OVER AN ORE, COPPER, COAL OR CRYSTAL DEPOSIT; ITS OUTPUT GOES TO THE FRONT FACE OR A HAULER' : d.extract === 'water' ? 'STANDS IN OPEN WATER; DRAWS AND CANS IT' : 'DIGS THE GROUND IT STANDS ON (SOIL)'}</span></div>`;
    // construction
    h += `<div class="lbl pl-s">CONSTRUCTION <i>${lk.ok ? 'WHAT HAPPENS WHEN YOU PLACE IT' : 'LOCKED'}</i></div><ol class="bm-steps pl-s">`;
    h += `<li>THE SITE IS STAKED OUT AND SCAFFOLDED (${d.w}×${d.d} m, TURN WITH R).</li>`;
    if (Object.keys(c).length) h += `<li>WORKERS CARRY THE MATERIALS FROM STORAGE: ABOUT ${loads} LOAD${loads === 1 ? '' : 'S'}.</li>`;
    h += `<li>A CREW OF UP TO ${crew} BUILDS IT: ${Math.round(work)} CREW-SECONDS.</li>`;
    if (d.power > 0) h += `<li>A POWER POLE WITHIN 7 m CONNECTS IT TO THE GRID.</li>`;
    if (d.station || d.store) h += `<li>WIRE IT ON THE NODE MAP (N) SO WORKERS FEED IT AND CLEAR IT.</li>`;
    h += `</ol></div>`;
    const slot = (this.b.hotbar?.slots ?? []).indexOf(k);
    h += `<div class="act">${lk.ok ? `<span class="pl-btn go" data-a="place">PLACE <span class="pl-key">ENTER</span></span>` : `<span class="pl-btn off">LOCKED</span>`}<span class="pl-btn" data-a="slot">${slot >= 0 ? `SLOT <span class="pl-key">${(slot + 1) % 10}</span>` : 'TO HOTBAR'}</span></div>`;
    this.det.innerHTML = h;
    const cvs = this.det.querySelectorAll('canvas');
    this.stage = cvs[0];
    if (!keepStage) this.spin = -0.5;
    this.drawStage();
    this.footprint(cvs[1], d);
    this.det.querySelector('[data-a="place"]')?.addEventListener('click', () => this.b.choose(k));
    this.det.querySelector('[data-a="slot"]')?.addEventListener('click', () => { const hb = this.b.hotbar; if (!hb) return; const i = hb.slots.indexOf(k); if (i >= 0) hb.set(i, null); else { const e = hb.slots.indexOf(null); hb.set(e >= 0 ? e : 9, k); } this.detKey = ''; this.gridKey = ''; this.renderDet(); this.renderGrid(); });
  }
  private recipe(r: Recipe) {
    const ok = !r.skill || this.f.recipeOk(r);
    const side = (s: Recipe['in']) => Object.entries(s).filter(([id]) => id !== 'steam').map(([id, n]) => chip(id, null, n ?? 0)).join('');
    const out = r.robot ? `<span class="pl-chip"><b>${esc(r.robot.toUpperCase())}</b></span>` : r.research ? `<span class="pl-chip"><b>+${r.research} RESEARCH</b></span>` : side(r.out) || `<span class="pl-chip"><b>STEAM</b></span>`;
    const first = Object.entries(r.out).find(([id]) => id !== 'steam');
    const k = mod(this.f.g, 'craft.speed');
    return `<div class="bm-rec pl-ph ${ok ? '' : 'lock'}"><span class="nm pl-s">${esc(r.name.toUpperCase())}${ok ? '' : ' · LOCKED'}</span><span class="io">${side(r.in)}</span><span class="ar pl-s">&gt;</span><span class="io">${out}</span><span class="t pl-s"><b>${fmt(r.t / k)} S</b>${first ? `<br>${fmt(perMin(r, first[1] ?? 0) * k)}/MIN` : ''}</span></div>`;
  }
  /** the footprint plate: cells, the input face (back) and the output face (front) */
  private footprint(cv: HTMLCanvasElement, d: FDef) {
    const s = 7, pad = 3;
    const W = d.w * s + pad * 2 + 5, H = d.d * s + pad * 2 + 5;
    cv.width = W; cv.height = H; cv.style.width = W * 2 + 'px'; cv.style.height = H * 2 + 'px';
    const g = cv.getContext('2d')!;
    g.fillStyle = 'rgba(10,17,13,0.85)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#336240'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, W - 1, H - 1);
    const x0 = pad + 2, y0 = pad + 2;
    for (let j = 0; j < d.d; j++) for (let i = 0; i < d.w; i++) { g.fillStyle = (i + j) % 2 ? '#1b3525' : '#264a32'; g.fillRect(x0 + i * s, y0 + j * s, s - 1, s - 1); }
    // output face (front, +z drawn at the bottom) in amber, input faces in green
    if (d.output !== 'none') { g.fillStyle = '#d9a43a'; g.fillRect(x0, y0 + d.d * s, d.w * s - 1, 1); g.fillRect(x0 + Math.floor(d.w * s / 2) - 2, y0 + d.d * s + 1, 3, 1); g.fillRect(x0 + Math.floor(d.w * s / 2) - 1, y0 + d.d * s + 2, 1, 1); }
    if (d.input && d.input !== 'none') { g.fillStyle = '#7fb88a'; if (d.input === 'all' || d.input === 'back') g.fillRect(x0, y0 - 2, d.w * s - 1, 1); if (d.input === 'all' || d.input === 'sides') { g.fillRect(x0 - 2, y0, 1, d.d * s - 1); g.fillRect(x0 + d.w * s, y0, 1, d.d * s - 1); } }
  }
  private drawStage() { if (this.stage && this.sel && this.isOpen) turntable(this.sel, this.stage, this.spin); }
  private renderFoot() {
    const b = this.b;
    this.foot.innerHTML = `<span><span class="pl-key">LMB</span> PICK, AGAIN TO PLACE</span><span><span class="pl-key">DRAG</span> ONTO THE HOTBAR</span><span><span class="pl-key">1</span>-<span class="pl-key">0</span> OVER A TILE: SET SLOT</span><span><span class="pl-key">R</span> TURN</span><span class="sp"></span>
      <span class="tl ${b.tool === 'dismantle' ? 'on' : ''}" data-t="dismantle">DISMANTLE <span class="pl-key">X</span></span><span class="tl ${b.tool === 'copy' ? 'on' : ''}" data-t="copy">COPY <span class="pl-key">Y</span></span><span class="tl ${b.tool === 'paste' ? 'on' : ''}" data-t="paste">PASTE <span class="pl-key">U</span></span><span class="tl" data-t="nodes">NODE MAP <span class="pl-key">N</span></span>`;
    this.foot.querySelectorAll<HTMLElement>('[data-t]').forEach((e) => e.addEventListener('click', () => { const t = e.dataset.t!; if (t === 'nodes') { this.b.close(); this.b.onNodes?.(); return; } this.close(); b.setTool(t as never); }));
  }

  // ------------------------------------------------------------------ drag to the hotbar
  private tileDown(e: PointerEvent) {
    const t = (e.target as HTMLElement).closest('[data-kind]') as HTMLElement | null;
    if (!t || e.button !== 0) return;
    e.preventDefault();
    this.drag = { kind: t.dataset.kind as FKind, x: e.clientX, y: e.clientY, on: false, ghost: null };
  }
  private onMove = (e: PointerEvent) => {
    const d = this.drag; if (!d) return;
    if (!d.on && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) {
      d.on = true;
      d.ghost = el('div', 'pl-drag', document.body, `<img src="${still(d.kind, 104, 60)}" alt="">`); d.ghost.dataset.hw = 'glass'; paintHW(d.ghost);
      sfx('click', 0.9, 0.4);
    }
    if (d.on && d.ghost) {
      d.ghost.style.left = e.clientX + 'px'; d.ghost.style.top = e.clientY + 'px';
      this.b.hotbar?.dropHover(e.clientX, e.clientY);
    }
  };
  private onUp = (e: PointerEvent) => {
    const d = this.drag; if (!d) return;
    this.drag = null;
    if (d.on) {
      const i = this.b.hotbar?.dropAt(e.clientX, e.clientY) ?? -1;
      if (i >= 0) { this.b.hotbar!.set(i, d.kind); sfx('done', 1.2, 0.5); this.gridKey = ''; this.detKey = ''; this.renderGrid(); this.renderDet(); }
      d.ghost?.remove(); this.b.hotbar?.dropHover(-1, -1);
      return;
    }
    // a plain click: select (a second click on the selected tile places it)
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) {
      if (this.sel === d.kind && buildingLock(this.f.g, d.kind).ok) { this.b.choose(d.kind); return; }
      this.select(d.kind); sfx('click', 1.3, 0.4);
    }
  };
  private endDrag() { this.drag?.ghost?.remove(); this.drag = null; this.b.hotbar?.dropHover(-1, -1); }
  /** a number key while the menu is open: the hovered (or selected) tile goes into that slot */
  key(k: string): boolean {
    if (!this.isOpen) return false;
    const n = '1234567890'.indexOf(k);
    if (n >= 0) { const kind = this.hover ?? this.sel; if (kind && this.b.hotbar) { this.b.hotbar.set(n, kind); sfx('done', 1.2, 0.5); this.gridKey = ''; this.detKey = ''; this.renderGrid(); this.renderDet(); } return true; }
    if (k === 'Enter' && this.sel && buildingLock(this.f.g, this.sel).ok) { this.b.choose(this.sel); return true; }
    return false;
  }

  update(dt: number) {
    if (!this.isOpen) return;
    this.spinT += dt;
    this.spin += dt * 0.45;
    if (this.spinT > 1 / 10) { this.spinT = 0; this.drawStage(); }
    this.slow -= dt;
    if (this.slow <= 0) { this.slow = 0.5; this.renderGrid(); this.renderDet(); }
  }
  private slow = 0;
}
