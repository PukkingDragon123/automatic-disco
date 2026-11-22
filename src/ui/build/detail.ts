// THE BUILDING DATA CARD (V7 "EMPIRE BUILDING": rich context on every building, like Dragon City's and Planet Zoo's
// building cards). A tall kit housing down the right of build mode that shows the building under the pointer in the
// catalogue, else the one carried or in hand, else the one selected on the map, else the last card picked:
//   its NAME, category and tier, the outlined model turning on a turntable in a sunk well, size, height, hull, how many
//   stand in the settlement and how much construction work it takes;
//   its full DESCRIPTION;
//   COST item by item with what the stores hold (red where short);
//   UPKEEP: power, workers, what it consumes per minute;
//   PRODUCTION & EFFECTS: its recipes with rates, extraction, storage, throughput, power made, reach;
//   REQUIREMENTS & UNLOCK: the ground it needs, whether it is unlocked and the skill-tree node / research that opens it;
//   a STATUS line saying what happens if you place it now, and the keys.
// With nothing to show it explains build mode and sums up the settlement.
import type { Factory } from '../../factory/factory';
import { FDEFS, footW, footD, type FKind } from '../../factory/defs';
import { itemIcon } from '../../factory/items';
import { catOf, workOf } from '../../logistics/catalog';
import { panel, section, para, kv, status, keyHint, type Panel } from '../kit/panel';
import { spinFrame } from './studio';
import { bill, tierOf, ROMAN, catName, say, esc, fmt, builtOf, upkeep, effects, unlockPath, siteRule } from './info';

const FRAMES = 36, PW = 96, PH = 72;
const reels = new Map<FKind, (HTMLCanvasElement | null)[]>();

export class BuildDetail {
  readonly pan: Panel;
  readonly root: HTMLDivElement;
  private cv: HTMLCanvasElement; private g: CanvasRenderingContext2D;
  private top: HTMLDivElement; private bodyEl: HTMLDivElement;
  kind: FKind | null = null;
  private key = ''; private ang = 0; private cur = -1; private t = 0; private shotT = -1; private shown: FKind | null = null;
  isOpen = false;

  constructor(readonly f: Factory, readonly host: { inHand(): FKind | null; moving(): boolean; view(): 'normal' | 'blueprint' }) {
    const p = (this.pan = panel({ title: 'BUILDING DATA', tone: 'gun', seed: 29, serial: 'SPEC SHEET', lamps: ['green', 'amber', 'red'], glands: 1, knobs: 2, stencil: 'SETTLEMENT WORKS', cls: 'bd' }));
    this.root = p.el;
    p.body.innerHTML = `<div class="bd-top"></div><div class="bd-pic"><canvas width="${PW}" height="${PH}"></canvas></div><div class="bd-body"></div>`;
    this.top = p.body.querySelector('.bd-top')!; this.bodyEl = p.body.querySelector('.bd-body')!;
    this.cv = p.body.querySelector('canvas')!; this.g = this.cv.getContext('2d')!; this.g.imageSmoothingEnabled = false;
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    document.body.appendChild(this.root);
  }
  dispose() { this.pan.dispose(); }
  open() { this.isOpen = true; this.root.classList.remove('out'); void this.root.offsetWidth; this.root.classList.add('on'); this.key = ''; }
  close() { if (!this.isOpen) return; this.isOpen = false; this.root.classList.add('out'); this.root.classList.remove('on'); }

  /** show this building (null: the guide) */
  show(kind: FKind | null) { this.kind = kind && FDEFS[kind] ? kind : null; }

  update(dt: number) {
    if (!this.isOpen) return;
    this.t += dt;
    const k = this.kind;
    if (k !== this.shown) { this.shown = k; this.key = ''; this.cur = -1; this.root.classList.remove('flip'); void this.root.offsetWidth; this.root.classList.add('flip'); }
    // the content follows the stores and the counts (cheap key, rebuilt only on change)
    if (Math.floor(this.t * 3) !== Math.floor((this.t - dt) * 3) || !this.key) {
      const key = k ? this.keyOf(k) : `guide|${this.f.buildings.length}|${this.f.sites?.list.length ?? 0}|${this.host.view()}`;
      if (key !== this.key) { this.key = key; if (k) this.render(k); else this.guide(); }
    }
    // the turntable
    this.root.classList.toggle('nopic', !k);
    if (!k) return;
    this.ang += dt * 0.9;
    const i = ((Math.round((this.ang / (Math.PI * 2)) * FRAMES) % FRAMES) + FRAMES) % FRAMES;
    if (i === this.cur) return;
    let r = reels.get(k); if (!r) reels.set(k, (r = new Array(FRAMES).fill(null)));
    // a new frame of the turn is shot at most every 0.12 s (each is a small render and read-back); cached ones replay
    if (!r[i]) { if (this.t - this.shotT < 0.12) return; this.shotT = this.t; r[i] = spinFrame(k, PW, PH, (i / FRAMES) * Math.PI * 2); }
    const fr = r[i]; if (!fr) return;
    this.cur = i; this.g.clearRect(0, 0, PW, PH); this.g.drawImage(fr, 0, 0);
  }
  private keyOf(k: FKind) {
    const ls = bill(this.f, k), [n, s] = builtOf(this.f, k);
    return `${k}|${ls.map((l) => l.have).join(',')}|${n}|${s}|${unlockPath(this.f, k).ok}|${this.host.inHand() === k}|${this.host.moving()}`;
  }

  // ------------------------------------------------------------------ a building
  private render(k: FKind) {
    const f = this.f, d = FDEFS[k], c = catOf(k), t = tierOf(k), [n, s] = builtOf(f, k), lines = bill(f, k), up = unlockPath(f, k);
    this.pan.lamp(0, up.ok && !lines.some((l) => l.short)); this.pan.lamp(1, up.ok && lines.some((l) => l.short)); this.pan.lamp(2, !up.ok);
    this.top.innerHTML = `<div class="bd-name k7-t32">${esc(d.name)}</div><div class="bd-sub k7-t16">${esc(catName(c))}  ·  TIER ${ROMAN[t]}  ·  ${t <= 1 ? 'basic materials' : t === 2 ? 'refined materials' : t === 3 ? 'machine parts' : t === 4 ? 'assemblies' : 'advanced parts'}</div>`;
    const B = this.bodyEl; B.innerHTML = '';
    // the facts beside the picture
    const side = document.createElement('div'); side.className = 'bd-facts';
    side.append(
      kv('Footprint', `${footW(d, 0)} x ${footD(d, 0)} m`).el,
      kv('Height', `${fmt(d.h)} m`).el,
      kv('Hull', `${d.hp} HP`).el,
      kv('Built', n || s ? `${n}${s ? ` (+${s} site${s > 1 ? 's' : ''})` : ''}` : 'none yet', { color: n ? '#9fe08a' : undefined }).el,
      kv('Build time', `${Math.round(workOf(d))} s, one worker`).el,
    );
    B.append(side, para(say(d.desc), { cls: 'bd-desc' }));
    // cost, item by item
    B.append(section('COST', 'in stores / needed'));
    if (!lines.length) B.append(para('Free: nothing to deliver.', { dim: true }));
    for (const l of lines) {
      const r = kv(l.name, `${Math.min(99999, l.have)} / ${l.need}`, { color: l.short ? '#ff9a7a' : '#c7e6ce' });
      const img = document.createElement('img'); img.className = 'bd-ic'; img.src = itemIcon(l.id, 32); img.alt = '';
      r.el.prepend(img); r.el.classList.add('bd-cost'); B.append(r.el);
    }
    // upkeep
    B.append(section('UPKEEP', 'while it runs'));
    for (const [a, b] of upkeep(k)) if (a !== 'Hull') B.append(kv(a, b).el);
    // production and effects
    B.append(section('PRODUCTION & EFFECTS'));
    for (const e of effects(k)) B.append(para(e, { cls: 'bd-eff' }));
    // requirements and the unlock path
    B.append(section('REQUIREMENTS & UNLOCK', up.ok ? 'unlocked' : 'locked'));
    B.append(para(`Ground: ${siteRule(k)}`, { cls: 'bd-eff' }));
    for (const l of up.lines) B.append(para(l, { dim: true, cls: 'bd-eff' }));
    // what happens if it is placed now
    const short = lines.filter((l) => l.short);
    const st = !up.ok ? status(`${up.why}.`, 'bad')
      : this.host.inHand() === k ? status('In hand: click the map to stake the site, R or the wheel turns it, right-click puts it back.', 'busy')
        : short.length ? status(`Short of ${short.map((l) => `${l.need - l.have} ${l.name}`).join(', ')}: you can still stake the site; haulers wait for the rest.`, 'warn')
          : status('Ready: everything is in the stores. Click the card, or drag it onto the map.', 'ok');
    st.el.classList.add('bd-st');
    const keys = document.createElement('div'); keys.className = 'bd-keys';
    keys.append(keyHint('LMB', 'place'), keyHint('R', 'turn'), keyHint('RMB', 'drop'), keyHint('V', 'view'));
    B.append(st.el, keys);
  }

  // ------------------------------------------------------------------ nothing picked: how build mode works, the settlement in numbers
  private guide() {
    const f = this.f, built = f.buildings.filter((b) => !b.def.hidden && !b.dead).length, sites = f.sites?.list.length ?? 0;
    this.pan.lamp(0, true); this.pan.lamp(1, sites > 0); this.pan.lamp(2, false);
    this.top.innerHTML = `<div class="bd-name k7-t32">BUILD MODE</div><div class="bd-sub k7-t16">Plan and grow the settlement</div>`;
    const B = this.bodyEl; B.innerHTML = '';
    B.append(para('Pick a building from the catalogue: hover a card to read everything about it here, click it to take it in hand, or drag it straight onto the map. Haulers carry the materials to the site and workers raise it.', { cls: 'bd-desc' }));
    B.append(section('THE SETTLEMENT'));
    B.append(kv('Buildings', built).el, kv('Sites under way', sites).el);
    B.append(section('VIEWS', this.host.view() === 'normal' ? 'normal' : 'blueprint'));
    B.append(para('NORMAL: the lit world from above, with a placement grid round the cursor.', { cls: 'bd-eff' }));
    B.append(para('BLUEPRINT: a site plan: every building a white drawing, ground, water and ore seams marked.', { cls: 'bd-eff' }));
    B.append(section('ON THE MAP'));
    for (const l of ['Click a building: select it (MOVE, TURN, INFO, PAUSE, TAKE DOWN).', 'Drag a building: pick it up and set it down elsewhere; its stock and crew go with it.', 'Dashed rings: ore seams. Amber dashes: construction sites.']) B.append(para(l, { cls: 'bd-eff' }));
    B.append(section('CATEGORIES'));
    B.append(para('Extraction, storage, logistics, processing, power, bio-engineering, research, defence, habitat and decoration: hover a tab for what it holds and how much of it is open.', { dim: true, cls: 'bd-eff' }));
    const st = status('Nothing in hand.', 'info'); st.el.classList.add('bd-st');
    const keys = document.createElement('div'); keys.className = 'bd-keys';
    keys.append(keyHint('V', 'switch view'), keyHint('B', 'leave'), keyHint('Esc', 'step back'));
    B.append(st.el, keys);
  }
}
