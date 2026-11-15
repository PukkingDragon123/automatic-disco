// The CONSTRUCTION PLANNER (B): the build menu, Techtonica-style, as an ENGINEER'S STEEL DRAWER. Ten stamped steel
// index tabs; a drawer of clean blueprint cards, each with a stylised low-resolution pixel-art picture of the building
// made from a real render of its model (./art.ts); and a blueprint sheet where the selected machine works in a small 3D
// vignette on its plinth, its inputs sliding in and its outputs coming out, with its callouts (in, out, power,
// footprint) on engraved steel tags with machined pointers, then its cost as real items with have/need and its recipes.
// Click a card to look, again to place; drag it onto the hotbar.
import './build.css';
import * as THREE from 'three';
import type { Factory } from '../../factory/factory';
import type { Build } from '../../factory/build';
import { FDEFS, type FKind, type FDef } from '../../factory/defs';
import { ITEMS, itemIcon, type ItemId } from '../../factory/items';
import { recipesAt, perMin, type Recipe } from '../../factory/recipes';
import { BUILD_CATS, catOf, kindsIn, workOf, registerColonyBuildings, type BuildCat } from '../../logistics/catalog';
import { buildingLock, mod } from '../../logistics/unlocks';
import { registerChains } from '../../logistics/recipes';
import { art } from './art';
import { attachLayer, addStage, removeStage, drawStages, studioScene, liveModel, frameCam, project, type Stage, type Live } from './vignette';
/** a machined pointer: a straight polished-steel rod with a shadow, ending in a rivet head (art px on the overlay) */
function pointer(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (const [c, o] of [['#0f2238', 1], ['#c4ccd2', 0]] as const) { g.fillStyle = c; for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + ((x1 - x0) * i) / n) + o, Math.round(y0 + ((y1 - y0) * i) / n) + o, 1, 1); }
  g.fillStyle = '#0f2238'; g.fillRect(x1 - 1, y1 - 1, 4, 4); g.fillStyle = '#e8edf0'; g.fillRect(x1 - 2, y1 - 2, 4, 4); g.fillStyle = '#8a96a2'; g.fillRect(x1, y1, 2, 2);
  g.fillStyle = '#0f2238'; g.fillRect(x0 - 1, y0 - 1, 3, 3); g.fillStyle = '#c4ccd2'; g.fillRect(x0 - 1, y0 - 1, 2, 2);
}
import { el } from '../kit';
import { gbuf } from '../../gfx/gbuf';
import { sfx } from '../../audio/audio';

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
const fmt = (n: number) => (n >= 100 ? Math.round(n).toString() : n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, ''));
/** the flagship of each section (its small render is on the tab) */
const FLAG: Record<BuildCat, FKind[]> = {
  extraction: ['miner1'], storage: ['st_bin', 'silo', 'crate'], logistics: ['splitter', 'belt1'], processing: ['smelter'], power: ['steamgen', 'boiler'],
  bio: ['cropplot', 'shed'], research: ['lab'], defence: ['turret'], habitat: ['bunkhouse', 'barracks'], decor: ['flagpole', 'floodlight'],
};
/** tab labels (Spleen at 24 px) */
const SHORT: Record<BuildCat, string> = { extraction: 'EXTRACT', storage: 'STORAGE', logistics: 'LOGISTIC', processing: 'PROCESS', power: 'POWER', bio: 'BIO-ENG', research: 'RESEARCH', defence: 'DEFENCE', habitat: 'HABITAT', decor: 'DECOR' };
const LETTER: Record<BuildCat, string> = { extraction: 'A', storage: 'B', logistics: 'C', processing: 'D', power: 'E', bio: 'F', research: 'G', defence: 'H', habitat: 'J', decor: 'K' };
/** an item with have/need (or just the need) in ink: its icon and the numbers */
export const chip = (id: ItemId, have: number | null, need: number, big = false) => {
  const lack = have !== null && have < need;
  return `<span class="cr-chip ${lack ? 'lack' : ''} ${big ? 'big' : ''}" title="${esc(ITEMS[id]?.name ?? id)}"><img src="${itemIcon(id, 44)}" alt=""><b>${have === null ? need : fmt(Math.min(have, 9999))}</b>${have === null ? '' : `<i>/${need}</i>`}</span>`;
};
type DetStage = Stage & { live: Live; tokens: THREE.Mesh[]; kind: FKind };

export class BuildMenu {
  readonly root: HTMLDivElement;
  private dim: HTMLDivElement;
  private tabs: HTMLDivElement; private grid: HTMLDivElement; private det: HTMLDivElement; private foot: HTMLDivElement;
  private q: HTMLInputElement;
  tab: BuildCat = 'extraction';
  sel: FKind | null = 'miner1';
  hover: FKind | null = null;
  isOpen = false;
  private gridKey = ''; private detKey = '';
  private detStage: DetStage | null = null;
  private ink: HTMLCanvasElement | null = null;
  private t = 0; private slow = 0;
  private drag: { kind: FKind; x: number; y: number; on: boolean; ghost: HTMLDivElement | null } | null = null;

  constructor(readonly f: Factory, readonly b: Build) {
    registerColonyBuildings();
    // over the whole HUD while it is open (a dim veil under it), like the node map
    this.dim = el('div', 'bm-dim', document.body);
    const r = (this.root = el('div', 'cr bm', document.body));
    const head = el('div', 'bm-head', r);
    head.innerHTML = `<span class="bm-title cr-tl">CONSTRUCTION</span><span class="sp"></span>`;
    const sb = el('label', 'bm-search', head);
    el('span', 'cr-s', sb, 'FIND');
    this.q = el('input', '', sb); this.q.placeholder = ''; this.q.spellcheck = false;
    el('span', 'cr-chit bm-x', head, 'CLOSE <span class="cr-key">B</span>');
    this.tabs = el('div', 'bm-tabs', r);
    const body = el('div', 'bm-body', r);
    this.grid = el('div', 'bm-grid', body);
    this.det = el('div', 'bm-det', body);
    this.foot = el('div', 'bm-foot cr-s', r);
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
  dispose() { removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); if (this.detStage) removeStage(this.detStage); this.root.remove(); this.dim.remove(); }

  open() {
    if (this.isOpen) return;
    registerChains();
    this.isOpen = true; this.root.classList.add('on'); this.dim.classList.add('on'); document.body.classList.add('bm-open');
    const tb = document.querySelector('#ui > .toasts'); if (tb) document.body.appendChild(tb);
    attachLayer(this.root, 5);
    this.gridKey = ''; this.detKey = '';
    this.renderTabs(); this.renderGrid(); this.renderDet(); this.renderFoot();
    sfx('open', 1.1, 0.5);
  }
  close() {
    if (!this.isOpen) return; this.isOpen = false; this.root.classList.remove('on'); this.dim.classList.remove('on'); document.body.classList.remove('bm-open'); this.q.blur(); this.endDrag();
    const tb = document.querySelector('body > .toasts'), u = document.getElementById('ui'); if (tb && u && !document.body.classList.contains('nm-open')) u.appendChild(tb);
  }
  setTab(t: BuildCat) { if (t === this.tab && !this.q.value) return; this.tab = t; this.q.value = ''; this.gridKey = ''; const first = kindsIn(t)[0]; if (first) this.sel = first; sfx('click', 1.25, 0.45); this.renderTabs(); this.renderGrid(); this.renderDet(); }
  select(k: FKind) { this.sel = k; this.detKey = ''; for (const e of this.grid.querySelectorAll<HTMLElement>('[data-kind]')) e.classList.toggle('sel', e.dataset.kind === k); this.renderDet(); }

  /** the kinds the board shows (a search spans every section) */
  private visible(): FKind[] {
    const q = this.q.value.trim().toLowerCase();
    if (q) return BUILD_CATS.flatMap((c) => kindsIn(c.k)).filter((k) => FDEFS[k].name.toLowerCase().includes(q) || FDEFS[k].desc.toLowerCase().includes(q));
    return kindsIn(this.tab);
  }
  private have(id: ItemId) { return this.f.sites ? this.f.sites.avail(id) : this.f.count(id); }
  private cost(d: FDef) { return this.f.sites ? this.f.sites.costOf(d) : d.cost; }

  // ------------------------------------------------------------------ tabs
  private renderTabs() {
    const g = this.f.g;
    this.tabs.innerHTML = BUILD_CATS.map((c) => {
      const ks = kindsIn(c.k), open = ks.filter((k) => buildingLock(g, k).ok).length;
      const flag = FLAG[c.k].find((k) => FDEFS[k]) ?? ks[0];
      const img = flag ? art(flag, 'small') : '';
      return `<div class="bm-tab ${c.k === this.tab && !this.q.value ? 'on' : ''}" data-tab="${c.k}" title="${esc(c.name)}">${img ? `<img src="${img}" alt="">` : ''}<span class="nm">${SHORT[c.k]}</span><span class="ct">${open}/${ks.length}</span></div>`;
    }).join('');
    this.tabs.querySelectorAll<HTMLElement>('[data-tab]').forEach((e) => e.addEventListener('click', () => this.setTab(e.dataset.tab as BuildCat)));
  }

  // ------------------------------------------------------------------ the pinboard of cards
  private renderGrid(force = false) {
    const g = this.f.g, ks = this.visible();
    const slots = this.b.hotbar?.slots ?? [];
    // the cards are rebuilt only when what is on the board changes; counts update in place
    const key = `${this.tab}|${this.q.value}|${ks.join(',')}|${slots.join(',')}|${ks.map((k) => buildingLock(g, k).ok).join('')}`;
    if (key !== this.gridKey || force) { this.gridKey = key; this.buildGrid(ks); }
    for (const e of this.grid.querySelectorAll<HTMLElement>('[data-kind]')) {
      const k = e.dataset.kind as FKind, c = this.cost(FDEFS[k]), box = e.querySelector('.cost') as HTMLElement | null;
      const html = Object.entries(c).map(([id, n]) => chip(id, this.have(id), n ?? 0)).join('');
      if (box && box.dataset.h !== html) { box.dataset.h = html; box.innerHTML = html; }
    }
  }
  private buildGrid(ks: FKind[]) {
    const g = this.f.g, slots = this.b.hotbar?.slots ?? [];
    const ready = ks.filter((k) => buildingLock(g, k).ok), locked = ks.filter((k) => !buildingLock(g, k).ok);
    const tile = (k: FKind) => {
      const d = FDEFS[k], lk = buildingLock(g, k);
      const idx = kindsIn(catOf(k)).indexOf(k) + 1, slot = slots.indexOf(k);
      const spec: string[] = [];
      if (d.power > 0) spec.push(`${fmt(d.power * mod(g, 'power.draw'))} MW`); else if (d.power < 0) spec.push(`<span class="gen">+${fmt(-d.power * mod(g, 'power.out'))} MW</span>`);
      const tp = this.throughput(d); if (tp) spec.push(tp);
      return `<div class="bm-tile ${this.sel === k ? 'sel' : ''} ${lk.ok ? '' : 'locked'}" data-kind="${k}">
        <div class="pic"><img src="${art(k)}" alt="" draggable="false"><span class="no cr-s">${LETTER[catOf(k)]}${String(idx).padStart(2, '0')}</span><span class="fp cr-s">${d.w}×${d.d}</span>${slot >= 0 ? `<span class="cr-key hk">${(slot + 1) % 10}</span>` : ''}</div>
        <div class="nm">${esc(d.name.toUpperCase())}</div>
        <div class="spec cr-s">${spec.join(' · ') || '&nbsp;'}</div>
        <div class="cost"></div>
        ${lk.ok ? '' : `<div class="lock"><span class="cr-stamp">LOCKED</span><small>${esc(lk.why)}</small></div>`}
      </div>`;
    };
    let h = '';
    if (!ks.length) h = `<div class="bm-empty">${this.q.value ? 'NO BUILDING MATCHES THAT' : 'NOTHING HERE YET'}</div>`;
    else {
      h += ready.map(tile).join('');
      if (locked.length) h += `<div class="bm-sec"><b>LOCKED</b><span class="cr-s">${locked.length}</span></div>` + locked.map(tile).join('');
    }
    this.grid.innerHTML = h;
    this.grid.scrollTop = 0;
    this.grid.querySelectorAll<HTMLElement>('[data-kind]').forEach((e) => {
      const k = e.dataset.kind as FKind;
      e.addEventListener('pointerenter', () => { this.hover = k; });
      e.addEventListener('pointerleave', () => { if (this.hover === k) this.hover = null; });
      e.addEventListener('dblclick', () => this.b.choose(k));
    });
  }
  /** one line of what a building moves or makes */
  throughput(d: FDef): string {
    const g = this.f.g;
    if (d.extract) return `${fmt((d.rate ?? 0) * 60 * mod(g, 'mine.rate'))}/MIN`;
    if (d.belt) return `${Math.round(d.belt * 180 * mod(g, 'belt.speed'))}/MIN`;
    if (d.store) return `HOLDS ${d.store}`;
    if (d.station) { const rs = recipesAt(d.station); if (rs.length) return `${rs.length} RECIPE${rs.length > 1 ? 'S' : ''}`; }
    if (d.radius) return `${d.radius} M REACH`;
    return '';
  }

  // ------------------------------------------------------------------ the detail sheet
  private renderDet() {
    const k = this.sel && FDEFS[this.sel] ? this.sel : null, g = this.f.g;
    if (!k) { this.det.innerHTML = `<div class="bm-empty">PICK A CARD</div>`; return; }
    const d = FDEFS[k], lk = buildingLock(g, k), c = this.cost(d);
    const key = `${k}|${lk.ok}|${Object.keys(c).map((id) => this.have(id)).join(',')}|${(this.b.hotbar?.slots ?? []).indexOf(k)}`;
    if (key === this.detKey) return;
    const sameKind = this.detKey.split('|')[0] === k;
    this.detKey = key;
    const cat = BUILD_CATS.find((x) => x.k === catOf(k))!;
    const work = workOf(d) / mod(g, 'build.speed'), crew = Math.max(1, Math.min(4, Math.round(d.w * d.d / 3)));
    const rs = d.station ? recipesAt(d.station) : [], r0 = rs.find((r) => !r.skill || this.f.recipeOk(r)) ?? rs[0];
    const ins = r0 ? Object.entries(r0.in).filter(([id]) => id !== 'steam') : [], outs = r0 ? Object.entries(r0.out).filter(([id]) => id !== 'steam') : [];
    const seam = d.extract === 'node' ? ['ore', 'copper_ore', 'coal'].filter((id) => ITEMS[id]) : d.extract === 'water' ? ['water'] : d.extract === 'soil' ? ['soil'] : [];
    let h = `<div class="stage"><span class="tag cr-s">${LETTER[cat.k]}${String(kindsIn(cat.k).indexOf(k) + 1).padStart(2, '0')}</span><canvas class="ink"></canvas>`;
    // callouts: what goes in, what comes out, the power, the footprint
    if (ins.length || seam.length) h += `<div class="co l" data-co="in"><span class="h">${seam.length ? 'DIGS' : 'IN'}</span><span class="row">${(seam.length ? seam.map((id) => `<span class="cr-chip big" title="${esc(ITEMS[id]?.name ?? id)}"><img src="${itemIcon(id, 44)}" alt=""></span>`) : ins.map(([id, n]) => chip(id, null, n ?? 0, true))).join('')}</span></div>`;
    if (outs.length || seam.length) h += `<div class="co r" data-co="out"><span class="h">OUT${r0 ? ` · ${fmt(r0.t / mod(g, 'craft.speed'))} S` : ''}</span><span class="row">${(outs.length ? outs.map(([id, n]) => chip(id, null, n ?? 0, true)) : [`<span class="cr-chip big"><b>${fmt((d.rate ?? 0) * 60)}/MIN</b></span>`]).join('')}</span></div>`;
    if (d.power) h += `<div class="co r" data-co="pw"><span class="h">${d.power > 0 ? 'DRAWS' : 'MAKES'}</span><span class="cr-chip big"><b>${d.power > 0 ? fmt(d.power * mod(g, 'power.draw')) : '+' + fmt(-d.power * mod(g, 'power.out'))} MW</b></span></div>`;
    h += `<div class="co l" data-co="fp"><span class="h">FLOOR</span><span class="cr-chip big"><b>${d.w}×${d.d} M</b></span></div>`;
    h += `</div>`;
    h += `<div class="hd"><div class="nm">${esc(d.name.toUpperCase())}</div><div class="facts"><span><i class="cr-s">BUILD</i>${Math.round(work)} S</span><span><i class="cr-s">CREW</i>${crew}</span><span><i class="cr-s">HULL</i>${d.hp}</span></div></div>`;
    h += `<div class="scroll">`;
    h += `<div class="lbl cr-s">COST <i>STORES / NEED</i></div><div class="bm-bom">`;
    for (const [id, n] of Object.entries(c)) { const have = this.have(id), need = n ?? 0; h += `<span class="it ${have < need ? 'lack' : ''}" title="${esc(ITEMS[id]?.name ?? id)}"><img src="${itemIcon(id, 44)}" alt=""><span class="n">${fmt(Math.min(have, 9999))}<i>/${need}</i></span></span>`; }
    if (!Object.keys(c).length) h += `<span class="cr-s">FREE</span>`;
    h += `</div>`;
    if (rs.length) { h += `<div class="lbl cr-s">RECIPES <i>S · /MIN</i></div>`; for (const r of rs) h += this.recipe(r); }
    h += `</div>`;
    const slot = (this.b.hotbar?.slots ?? []).indexOf(k);
    h += `<div class="act">${lk.ok ? `<span class="cr-chit" data-a="place">PLACE <span class="cr-key">ENTER</span></span>` : `<span class="cr-chit off" title="${esc(lk.why)}">LOCKED</span>`}<span class="cr-chit" data-a="slot">${slot >= 0 ? `KEY <span class="cr-key">${(slot + 1) % 10}</span>` : 'HOTBAR'}</span></div>`;
    if (!lk.ok) h += `<div class="why cr-s">${esc(lk.why.toUpperCase())}</div>`;
    // keep the live stage across refreshes of the same building (the counts change, the vignette goes on)
    const keep = sameKind && this.detStage ? this.det.querySelector('.stage') : null;
    this.det.innerHTML = h;
    void keep;
    this.ink = this.det.querySelector('canvas.ink');
    this.makeDetStage(k, ins.map(([id]) => id), outs.length ? outs.map(([id]) => id) : seam.slice(0, 1), sameKind);
    this.det.querySelector('[data-a="place"]')?.addEventListener('click', () => this.b.choose(k));
    this.det.querySelector('[data-a="slot"]')?.addEventListener('click', () => { const hb = this.b.hotbar; if (!hb) return; const i = hb.slots.indexOf(k); if (i >= 0) hb.set(i, null); else { const e = hb.slots.indexOf(null); hb.set(e >= 0 ? e : 9, k); } this.detKey = ''; this.gridKey = ''; this.renderDet(); this.renderGrid(); });
  }
  /** the machine at work on a plinth: inputs slide into its back face, outputs come out of the front */
  private makeDetStage(k: FKind, ins: ItemId[], outs: ItemId[], reuse: boolean) {
    const stEl = this.det.querySelector('.stage') as HTMLElement;
    if (reuse && this.detStage && this.detStage.kind === k) { this.detStage.el = stEl; return; }
    if (this.detStage) removeStage(this.detStage);
    const scene = studioScene({ ground: null, shadow: true }), cam = new THREE.PerspectiveCamera(24, 2, 0.1, 100);
    const d = FDEFS[k];
    // a dark disc of blueprint under the plinth to catch the shadow
    const disc = new THREE.Mesh(new THREE.CircleGeometry(Math.max(d.w, d.d) * 0.5 + 0.7, 24), gbuf(new THREE.MeshLambertMaterial({ color: 0x1f3d60 })));
    disc.rotation.x = -Math.PI / 2; disc.position.y = -0.19; disc.receiveShadow = true; scene.add(disc);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(d.w + 0.8, 0.18, d.d + 0.8), gbuf(new THREE.MeshLambertMaterial({ color: 0x6f7a84 })));
    plinth.position.y = -0.09; plinth.receiveShadow = true; scene.add(plinth);
    const tokens: THREE.Mesh[] = [];
    const tok = (id: ItemId, out: boolean, i: number, n: number) => {
      const tx = new THREE.TextureLoader().load(itemIcon(id, 32)); tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.colorSpace = THREE.SRGBColorSpace;
      const side = new THREE.MeshLambertMaterial({ color: ITEMS[id]?.side ?? 0x8a7a5a }), face = new THREE.MeshLambertMaterial({ map: tx, color: 0xffffff });
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), [side, side, face, side, face, face]);
      m.castShadow = true; m.userData = { out, i, n };
      scene.add(m); tokens.push(m);
    };
    ins.slice(0, 3).forEach((id, i, a) => tok(id, false, i, a.length)); outs.slice(0, 3).forEach((id, i, a) => tok(id, true, i, a.length));
    const st = { el: stEl, scene, cam, bg: null, live: null as unknown as Live, tokens, kind: k } as DetStage;
    const fit = () => { if (st.live) scene.remove(st.live.root); st.live = liveModel(k, fit); scene.add(st.live.root); };
    fit();
    st.tick = (dt, t) => {
      frameCam(cam, st.live, -0.55 + Math.sin(t * 0.25) * 0.18, 0.42, 0.62);
      st.live.tick(dt, true);
      // the loads: in from behind (-z) into the back face, out of the front (+z)
      for (const m of tokens) {
        const { out, i, n } = m.userData as { out: boolean; i: number; n: number };
        const p = (t * 0.35 + i / Math.max(1, n)) % 1;
        const z0 = out ? d.d / 2 - 0.2 : -d.d / 2 - 1.6, z1 = out ? d.d / 2 + 1.6 : -d.d / 2 + 0.2;
        m.position.set((i - (n - 1) / 2) * 0.45, 0.25 + Math.sin(p * Math.PI) * 0.12, z0 + (z1 - z0) * p);
        m.rotation.y = t * 0.8 + i;
        m.visible = !(out ? p < 0.1 : p > 0.9);
      }
    };
    this.detStage = st; addStage(st);
  }
  private recipe(r: Recipe) {
    const ok = !r.skill || this.f.recipeOk(r);
    const side = (s: Recipe['in']) => Object.entries(s).filter(([id]) => id !== 'steam').map(([id, n]) => chip(id, null, n ?? 0, true)).join('');
    const out = r.robot ? `<span class="cr-chip"><b>${esc(r.robot.toUpperCase())}</b></span>` : r.research ? `<span class="cr-chip"><b>+${r.research} RESEARCH</b></span>` : side(r.out) || `<span class="cr-chip"><b>STEAM</b></span>`;
    const first = Object.entries(r.out).find(([id]) => id !== 'steam');
    const k = mod(this.f.g, 'craft.speed');
    return `<div class="bm-rec ${ok ? '' : 'lock'}" title="${esc(r.name)}"><span class="io">${side(r.in)}</span><span class="ar cr-s">&gt;</span><span class="io">${out}</span><span class="t cr-s"><b>${fmt(r.t / k)} S</b>${first ? `<br>${fmt(perMin(r, first[1] ?? 0) * k)}/MIN` : ''}</span></div>`;
  }
  /** callouts sit in the corners of the stage; leader lines run from each to the part of the machine it is about */
  private drawCallouts() {
    const st = this.detStage, cv = this.ink; if (!st || !cv || !st.live || !cv.isConnected) return;
    const pos: Record<string, string> = { in: 'left:0;top:30px', fp: 'left:0;bottom:6px', out: 'right:0;top:30px', pw: 'right:0;bottom:6px' };
    const box = st.el.getBoundingClientRect();
    const W = Math.round(box.width / 2), H = Math.round(box.height / 2);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d')!; g.clearRect(0, 0, W, H);
    const d = FDEFS[st.kind], sz = st.live.size;
    const at: Record<string, THREE.Vector3> = {
      in: new THREE.Vector3(0, sz.y * 0.4, -d.d / 2), out: new THREE.Vector3(0, sz.y * 0.3, d.d / 2),
      pw: new THREE.Vector3(0, sz.y * 0.92, 0), fp: new THREE.Vector3(-d.w / 2, 0.02, d.d / 2),
    };
    for (const co of this.det.querySelectorAll<HTMLElement>('[data-co]')) {
      const k = co.dataset.co!, p = at[k]; if (!p) continue;
      if (co.dataset.pos !== k) { co.dataset.pos = k; co.setAttribute('style', pos[k] ?? ''); }
      const [px, py] = project(st, p);
      const cb = co.getBoundingClientRect();
      const ax = (co.classList.contains('r') ? cb.left - 4 : cb.right + 4) - box.left, ay = cb.top + cb.height / 2 - box.top;
      pointer(g, ax / 2, ay / 2, (px - box.left) / 2, (py - box.top) / 2);
    }
  }
  private renderFoot() {
    const b = this.b;
    this.foot.innerHTML = `<span><span class="cr-key">LMB</span> PICK</span><span><span class="cr-key">LMB</span><span class="cr-key">LMB</span> PLACE</span><span><span class="cr-key">DRAG</span> HOTBAR</span><span><span class="cr-key">1</span>-<span class="cr-key">0</span> KEY</span><span><span class="cr-key">R</span> TURN</span><span class="sp"></span>
      <span class="cr-chit sm ${b.tool === 'dismantle' ? 'on' : ''}" data-t="dismantle">DISMANTLE <span class="cr-key">X</span></span><span class="cr-chit sm ${b.tool === 'copy' ? 'on' : ''}" data-t="copy">COPY <span class="cr-key">Y</span></span><span class="cr-chit sm ${b.tool === 'paste' ? 'on' : ''}" data-t="paste">PASTE <span class="cr-key">U</span></span><span class="cr-chit sm" data-t="nodes">NODE MAP <span class="cr-key">N</span></span>`;
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
    if (!d.on && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) { d.on = true; d.ghost = el('div', 'pl-drag', document.body, `<img src="${art(d.kind)}" alt="">`); sfx('click', 0.9, 0.4); }
    if (d.on && d.ghost) { d.ghost.style.left = e.clientX + 'px'; d.ghost.style.top = e.clientY + 'px'; this.b.hotbar?.dropHover(e.clientX, e.clientY); }
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
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) {
      if (this.sel === d.kind && buildingLock(this.f.g, d.kind).ok) { this.b.choose(d.kind); return; }
      this.select(d.kind); sfx('click', 1.3, 0.4);
    }
  };
  private endDrag() { this.drag?.ghost?.remove(); this.drag = null; this.b.hotbar?.dropHover(-1, -1); }
  /** a number key while the planner is open: the hovered (or selected) card goes on that key */
  key(k: string): boolean {
    if (!this.isOpen) return false;
    const n = '1234567890'.indexOf(k);
    if (n >= 0) { const kind = this.hover ?? this.sel; if (kind && this.b.hotbar) { this.b.hotbar.set(n, kind); sfx('done', 1.2, 0.5); this.gridKey = ''; this.detKey = ''; this.renderGrid(); this.renderDet(); } return true; }
    if (k === 'Enter' && this.sel && buildingLock(this.f.g, this.sel).ok) { this.b.choose(this.sel); return true; }
    return false;
  }

  update(dt: number) {
    if (!this.isOpen) return;
    this.t += dt;
    this.slow -= dt;
    if (this.slow <= 0) { this.slow = 0.5; this.renderGrid(); this.renderDet(); }
    drawStages(dt, this.t);
    this.drawCallouts();
  }
}
