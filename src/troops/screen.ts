// TROOPS · THE TROOPS SCREEN (the dock's TROOPS slot; blast shutters in, the kit's 2D UI with 3D elements, not a room).
// A field-command board in the kit's materials: SQUADS on the left (olive enamel plates: a brass nameplate you can
// rename, the three STANCE switches aggressive / defensive / passive, an AREA pin you drop on the survey map, the
// members standing on the plate; drag a unit from plate to plate, or to the RESERVE plate, to move it); the UNIT in
// the middle (its own model turning on a plinth, health, morale and needs, its gear as glyphs and numbers, a history
// of its health and morale drawn in a glass well, its wounds), with the SURVEY MAP under it (the squads' areas, the
// units); PRODUCTION on the right: the ROBOT FOUNDRY (what it builds now, its progress, a queue of five, every robot
// it can make as a floating model with its bill of parts) and the LAB (the designs the colony can print, each with
// its cost). Very little text: glyphs, models and numbers.
import * as THREE from 'three';
import type { Game } from '../game/game';
import type { Troop } from './units';
import type { OrderBook, Squad, Stance } from './orders';
import { SQUAD_COLORS } from './orders';
import type { Rts } from './rts';
import type { DockCtx } from '../ui/hud7/dock';
import { pxCanvas, shadowBlob } from '../ui/kit/mat';
import { panel, type Panel } from '../ui/kit/panel';
import { Px, P, INK, cellBar, glassWell, hex } from '../ui/kit/px';
import { ModelView, toon } from '../ui/kit/model3d';
import { floatIcon } from '../ui/kit/floatIcon';
import { DOCK_MODELS } from '../ui/kit/models';
import { tex } from '../ui/kit/tex3d';
import { uiSfx } from '../ui/kit/sound';
import { pop, shake, bounceEl, squash, onFrame, placeDust } from '../ui/kit/juice';
import { glyphCanvas, portraitBuild, holdLights, bareBuild, hpRamp } from './art';
import { jobGlyph } from './cards';
import { paintTerrain } from '../ui/hud7/mapPaint';
import { RECIPE, recipesAt } from '../factory/recipes';
import { itemIcon } from '../factory/items';
import { buildModel } from '../robots/models';
import { liveryFor } from '../robots/atlas';
import { buildSpeciesModel, makeInstance } from '../life/creatureMesh';

type G = Game & Record<string, any>;
const STANCES: Stance[] = ['aggressive', 'defensive', 'passive'];
const QMAX = 5;

/** the foundry queues (recipe ids per foundry), kept across the screen's openings */
export class Foundry {
  readonly q = new Map<number, string[]>();
  private was = new Map<number, boolean>();
  constructor(readonly g: G) {}
  foundries(): any[] { return (this.g.factory?.buildings ?? []).filter((b: any) => !b.dead && b.def?.station === 'robotfab' && (b.rise ?? 1) >= 0.99); }
  queue(b: any): string[] { let a = this.q.get(b.id); if (!a) { a = []; this.q.set(b.id, a); } return a; }
  add(b: any, rid: string): boolean { const a = this.queue(b); if (a.length >= QMAX) return false; a.push(rid); this.tick(); return true; }
  remove(b: any, i: number) { const a = this.queue(b); a.splice(i, 1); }
  /** each foundry builds the head of its queue; a finished robot takes it off */
  tick() {
    const f = this.g.factory; if (!f) return;
    for (const b of this.foundries()) {
      const a = this.queue(b), was = this.was.get(b.id) ?? false;
      if (was && !b.running && a.length && b.recipe?.id === a[0]) a.shift();
      this.was.set(b.id, !!b.running);
      if (!b.running && a.length) { const r = RECIPE[a[0]]; if (r && b.recipe !== r) f.setRecipe?.(b, r); }
    }
  }
}

export class TroopsScreen {
  el: HTMLDivElement | null = null;
  private views: ModelView[] = [];
  private detailT: Troop | null = null;
  private armArea: number | null = null;
  private drag: { t: Troop; ghost: HTMLCanvasElement; x: number; y: number; on: boolean; src: HTMLElement } | null = null;
  private ctx: DockCtx | null = null;
  private live: (() => void)[] = [];
  private stop: (() => void) | null = null;
  private mapCv: HTMLCanvasElement | null = null; private mapBase: HTMLCanvasElement | null = null; private mapK = 1;
  constructor(readonly g: G, readonly book: OrderBook, readonly rts: Rts, readonly foundry: Foundry) { injectCSS(); }
  get isOpen() { return !!this.el; }

  open(ctx: DockCtx) {
    if (this.el) return;
    this.ctx = ctx;
    const el = this.el = document.createElement('div'); el.className = 'trs';
    document.body.append(el); document.body.classList.add('trs-on');
    const board = document.createElement('div'); board.className = 'trs-board'; el.append(board);
    // header: the name floating, the head count, BACK
    const hd = document.createElement('div'); hd.className = 'trs-hd';
    const title = document.createElement('div'); title.className = 'k7-name k7-t48'; title.textContent = 'TROOPS';
    const cnt = document.createElement('div'); cnt.className = 'trs-count'; cnt.append(glyphCanvas('troops', 'brass', 3)); const cn = document.createElement('span'); cn.className = 'k7-t32'; cnt.append(cn);
    hd.append(title, cnt);
    const back = floatIcon({ build: DOCK_MODELS.troops, name: 'BACK', size: [40, 34], nameSize: 16, sound: 'back', view: { pitch: 0.5, spin: 0, yaw0: 0.5, zoom: 1.3 }, onClick: () => this.close() });
    back.el.classList.add('trs-back'); board.append(hd, back.el);
    // the three columns
    const colA = div('trs-col a'), colB = div('trs-col b'), colC = div('trs-col c');
    board.append(colA, colB, colC);
    this.squadsCol = colA; this.detailCol = colB; this.prodCol = colC;
    this.buildSquads();
    this.buildDetail();
    this.buildMap();
    this.buildProduction();
    const all = this.book.troops;
    cn.textContent = String(all.length);
    this.show(this.rts.troops()[0] ?? all[0] ?? null);
    // live refresh
    let acc = 0;
    this.stop = onFrame((dt) => { if (!this.el) return false; acc += dt; if (acc > 0.25) { acc = 0; this.foundry.tick(); for (const f of this.live) f(); cn.textContent = String(this.book.troops.length); } this.drawMap(); return true; }) as unknown as () => void;
    addEventListener('keydown', this.onKey, true);
    addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp);
    this.g.emit?.('screen-open', { id: 'troops' });
    uiSfx('open', 0.5);
  }
  close() {
    if (!this.el) return;
    const done = () => { this.teardown(); };
    if (this.ctx) void this.ctx.close(done); else done();
  }
  private teardown() {
    removeEventListener('keydown', this.onKey, true); removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp);
    for (const v of this.views) v.dispose(); this.views = []; this.live = [];
    for (const p of this.panels) p.dispose(); this.panels = [];
    this.stop?.(); this.stop = null;
    this.el?.remove(); this.el = null; document.body.classList.remove('trs-on'); this.drag?.ghost.remove(); this.drag = null;
    this.book.save();
  }
  private onKey = (e: KeyboardEvent) => {
    if (!this.el) return;
    const tg = e.target as HTMLElement; if (tg?.tagName === 'INPUT') { if (e.key === 'Enter' || e.key === 'Escape') tg.blur(); e.stopPropagation(); return; }
    if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); if (this.armArea !== null) { this.armArea = null; this.mapCv?.classList.remove('arm'); uiSfx('back', 0.4); } else this.close(); return; }
    // the board has the keyboard: the colony's mode keys wait until it is put away
    if (!e.ctrlKey && !e.metaKey) e.stopImmediatePropagation();
  };

  // ------------------------------------------------------------------ squads
  private squadsCol!: HTMLDivElement; private detailCol!: HTMLDivElement; private prodCol!: HTMLDivElement;
  private squadEls = new Map<number | null, HTMLDivElement>();
  private panels: Panel[] = [];
  private buildSquads() {
    const col = this.squadsCol; col.innerHTML = ''; this.squadEls.clear();
    for (const sq of this.book.squads) col.append(this.squadPlate(sq));
    if (this.book.squads.length < 5) {
      const add = document.createElement('button'); add.type = 'button'; add.className = 'trs-add'; add.append(glyphCanvas('plus', 'brass', 3));
      add.addEventListener('click', () => {
        const id = Math.max(0, ...this.book.squads.map((s) => s.id)) + 1, names = ['DELTA', 'ECHO', 'FOXTROT', 'GOLF'];
        this.book.squads.push({ id, name: names[(id - 4 + 8) % 4], stance: 'defensive', area: null, color: SQUAD_COLORS[(id - 1) % SQUAD_COLORS.length] });
        uiSfx('confirm', 0.5); this.buildSquads(); this.book.save();
      });
      col.append(add);
    }
    col.append(this.squadPlate(null));
  }
  private squadPlate(sq: Squad | null): HTMLDivElement {
    // the kit's standard housing: the squad's name printed on its hood plate (click it to rename), lamps for its state
    const pn = panel({ tone: sq ? 'olive' : 'gun', seed: 60 + (sq?.id ?? 9), title: sq ? sq.name : 'RESERVE', head: 34, foot: 12, side: 8, lamps: sq ? ['green', 'amber'] : ['white'], hazard: false, glands: sq ? 1 : 0, cls: 'trs-sq' + (sq ? '' : ' pool') });
    const p = pn.el, body = pn.body;
    p.dataset.sq = sq ? String(sq.id) : 'pool';
    this.squadEls.set(sq?.id ?? null, p);
    this.panels.push(pn);
    const top = div('trs-sq-top');
    if (sq) {
      const inp = document.createElement('input'); inp.className = 'k7-t16 trs-in'; inp.value = sq.name; inp.maxLength = 10; inp.spellcheck = false; inp.setAttribute('aria-label', 'squad name');
      inp.addEventListener('change', () => { sq.name = (inp.value.trim() || sq.name).toUpperCase().slice(0, 10); inp.value = sq.name; pn.setTitle(sq.name); uiSfx('scratch', 0.45); pop(p, 0.15); this.book.save(); });
      inp.addEventListener('focus', () => { uiSfx('tick', 0.4); inp.select(); });
      p.append(inp);
      const sw = document.createElement('i'); sw.className = 'trs-swatch'; sw.style.background = hex(sq.color);
      const st = div('trs-stance');
      for (const s of STANCES) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'trs-st' + (sq.stance === s ? ' on' : ''); b.title = s;
        b.append(glyphCanvas(s, s === 'aggressive' ? 'red' : s === 'defensive' ? 'brass' : 'blue', 3));
        b.addEventListener('click', () => { sq.stance = s; for (const o of st.children) o.classList.toggle('on', o === b); squash(b, 0.8); uiSfx('switch', 0.55); pn.lamp(1, s === 'aggressive'); this.book.save(); });
        st.append(b);
      }
      const area = document.createElement('button'); area.type = 'button'; area.className = 'trs-area' + (sq.area ? ' set' : ''); area.append(glyphCanvas('area', sq.area ? 'amber' : 'dim', 3));
      area.addEventListener('click', () => { this.armArea = sq.id; this.mapCv?.classList.add('arm'); uiSfx('pluck', 0.5); pop(area, 0.6); for (const a of this.squadsCol.querySelectorAll('.trs-area')) a.classList.toggle('arm', a === area); });
      area.addEventListener('contextmenu', (e) => { e.preventDefault(); sq.area = null; area.classList.remove('set'); area.innerHTML = ''; area.append(glyphCanvas('area', 'dim', 3)); uiSfx('back', 0.4); this.book.save(); });
      const go = document.createElement('button'); go.type = 'button'; go.className = 'trs-go'; go.append(glyphCanvas('troops', 'cream', 3));
      go.addEventListener('click', () => { const m = this.book.members(sq.id); if (!m.length) { shake(go, 4); uiSfx('error', 0.4); return; } this.rts.select(m); this.close(); });
      top.append(sw, st, area, go);
      pn.lamp(0, true); pn.lamp(1, sq.stance === 'aggressive');
    }
    const row = div('trs-members');
    body.append(top, row);
    this.fillMembers(sq?.id ?? null);
    return p;
  }
  private fillMembers(id: number | null) {
    const p = this.squadEls.get(id); if (!p) return;
    const row = p.querySelector('.trs-members') as HTMLDivElement;
    for (const v of [...this.views]) if (row.contains(v.cv)) { v.dispose(); this.views.splice(this.views.indexOf(v), 1); }
    row.innerHTML = '';
    const list = this.book.troops.filter((t) => this.book.stateOf(t).squad === id);
    const max = id === null ? 16 : 9;
    for (const t of list.slice(0, max)) row.append(this.member(t));
    if (list.length > max) { const m = document.createElement('span'); m.className = 'k7-t32 trs-more'; m.textContent = '+' + (list.length - max); row.append(m); }
    if (!list.length) { const e = div('trs-empty'); e.append(glyphCanvas('troops', 'dim', 3)); row.append(e); }
  }
  private member(t: Troop): HTMLDivElement {
    const m = div('trs-mem'); m.dataset.key = t.key;
    let v: ModelView | null = null;
    v = new ModelView(portraitBuild(t), { w: 30, h: 34, scale: 2, spin: 0, rock: 0.45, yaw0: 0.55, pitch: 0.28, zoom: 1.1, shadow: [2, 2, 0.35], anim: (root) => holdLights(root, v?.yaw ?? 0) });
    this.views.push(v);
    const hb = document.createElement('canvas'); hb.className = 'trs-mbar'; hb.width = 26; hb.height = 6; hb.style.width = '52px'; hb.style.height = '12px';
    m.append(pxCanvas(shadowBlob(22, 5, 0.45), 2, 'trs-mem-sh'), v.cv, hb);
    const paint = () => { const p = new Px(26, 6); cellBar(p, 1, 1, 24, 4, t.hp01, hpRamp(t.hp01), 0); p.canvas(hb); m.classList.toggle('sel', this.detailT === t); };
    paint(); this.live.push(paint);
    m.addEventListener('pointerenter', () => { v?.hot(true); uiSfx('hover', 0.3); }); m.addEventListener('pointerleave', () => v?.hot(false));
    m.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; e.preventDefault();
      const ghost = document.createElement('canvas'); ghost.width = v!.cv.width; ghost.height = v!.cv.height; ghost.getContext('2d')!.drawImage(v!.cv, 0, 0); ghost.className = 'trs-ghost';
      this.drag = { t, ghost, x: e.clientX, y: e.clientY, on: false, src: m };
    });
    return m;
  }
  private onMove = (e: PointerEvent) => {
    const d = this.drag; if (!d) return;
    if (!d.on && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) { d.on = true; document.body.append(d.ghost); d.src.classList.add('lifted'); uiSfx('winch', 0.35, 1.4); }
    if (!d.on) return;
    d.ghost.style.left = e.clientX - 30 + 'px'; d.ghost.style.top = e.clientY - 48 + 'px';
    const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.trs-sq') as HTMLElement | null;
    for (const p of this.squadEls.values()) p.classList.toggle('drop', p === over);
  };
  private onUp = (e: PointerEvent) => {
    const d = this.drag; if (!d) return;
    this.drag = null; d.ghost.remove(); d.src.classList.remove('lifted');
    for (const p of this.squadEls.values()) p.classList.remove('drop');
    if (!d.on) { this.show(d.t); uiSfx('select', 0.45); return; }
    const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.trs-sq') as HTMLElement | null;
    if (!over) { uiSfx('swishOut', 0.35); return; }
    const id = over.dataset.sq === 'pool' ? null : Number(over.dataset.sq);
    const s = this.book.stateOf(d.t), from = s.squad;
    if (from === id) return;
    s.squad = id;
    this.fillMembers(from); this.fillMembers(id);
    const landed = over.querySelector(`.trs-mem[data-key="${d.t.key}"]`) as HTMLElement | null;
    if (landed) { bounceEl(landed, 0.45); const r = landed.getBoundingClientRect(); placeDust(r.left + r.width / 2, r.bottom - 8, 0.25, { ground: 'metal', layer: 'ui' }); }
    uiSfx('clunk', 0.5);
    this.book.save();
    if (this.detailT === d.t) this.show(d.t);
  };

  // ------------------------------------------------------------------ the unit
  private detPanel: Panel | null = null;
  private det: { port: HTMLDivElement; info: HTMLDivElement; hist: HTMLCanvasElement; wounds: HTMLDivElement } | null = null;
  private buildDetail() {
    const pn = panel({ tone: 'gun', seed: 77, head: 20, foot: 14, side: 10, lamps: ['green', 'amber', 'red'], knobs: 2, cls: 'trs-detail' }); this.panels.push(pn); this.detPanel = pn;
    const p = pn.body;
    const port = div('trs-dport'), info = div('trs-dinfo');
    const histW = div('trs-hist'); const hist = document.createElement('canvas'); hist.width = 272; hist.height = 62; hist.style.width = '544px'; hist.style.height = '124px'; histW.append(hist);
    const wounds = div('trs-wounds');
    p.append(port, info, histW, wounds);
    this.detailCol.append(pn.el);
    this.det = { port, info, hist, wounds };
  }
  private show(t: Troop | null) {
    const D = this.det; if (!D) return;
    this.detailT = t;
    for (const v of [...this.views]) if (D.port.contains(v.cv)) { v.dispose(); this.views.splice(this.views.indexOf(v), 1); }
    D.port.innerHTML = ''; D.info.innerHTML = ''; D.wounds.innerHTML = '';
    this.live = this.live.filter((f) => !(f as { det?: boolean }).det);
    if (!t) { D.port.append(glyphCanvas('troops', 'dim', 6)); return; }
    const s = this.book.stateOf(t);
    let v: ModelView | null = null;
    v = new ModelView(portraitBuild(t, { plinth: true }), { w: 120, h: 112, scale: 2, spin: 0.4, hotSpin: 1.8, pitch: 0.32, zoom: 1.0, shadow: [2, 2, 0.35], anim: (root) => holdLights(root, v?.yaw ?? 0) });
    this.views.push(v);
    D.port.append(pxCanvas(shadowBlob(90, 12, 0.5), 2, 'trs-dport-sh'), v.cv);
    D.port.onpointerenter = () => v?.hot(true); D.port.onpointerleave = () => v?.hot(false); D.port.onpointermove = (e) => v?.point(e.clientX, e.clientY);
    D.port.onclick = () => v?.poke(12);
    pop(D.port, 0.3);
    const head = div('trs-dhead');
    const nm = document.createElement('div'); nm.className = 'k7-t48 trs-dcall'; nm.textContent = s.call;
    const ty = document.createElement('div'); ty.className = 'k7-t16 trs-dtype'; ty.textContent = t.typeName;
    head.append(nm, ty);
    const bars = div('trs-dbars');
    const bar = (icon: string, pal: string, w: number) => { const r = div('trs-g'); r.append(glyphCanvas(icon, pal as never, 2)); const cv = document.createElement('canvas'); cv.width = w; cv.height = 8; cv.style.width = w * 2 + 'px'; cv.style.height = '16px'; r.append(cv); bars.append(r); return cv; };
    const hpC = bar('heart', 'red', 96), moC = bar('morale', 'blue', 96);
    const nd0 = t.needs(s), needC: Partial<Record<'food' | 'rest' | 'maint', HTMLCanvasElement>> = {};
    const nI = { food: t.kind === 'robot' || t.kind === 'drone' ? 'battery' : 'food', rest: 'rest', maint: t.kind === 'crew' ? 'suit' : 'maint' };
    for (const k of ['food', 'rest', 'maint'] as const) if (nd0[k] !== null) needC[k] = bar(nI[k], 'cream', 96);
    const gear = div('trs-gear');
    for (const g0 of t.gear()) { const gi = div('trs-gi'); gi.append(glyphCanvas(g0.icon.startsWith('part:') ? 'part' : g0.icon, 'steel', 2)); if (g0.val) { const n = document.createElement('span'); n.className = 'k7-t16'; n.textContent = g0.val; gi.append(n); } gi.title = g0.name; gear.append(gi); }
    const tally = div('trs-tally');
    const kills = div('trs-gi'); kills.append(glyphCanvas('attack', 'red', 2)); const kn = document.createElement('span'); kn.className = 'k7-t16'; kills.append(kn);
    const ords = div('trs-gi'); ords.append(glyphCanvas('move', 'cream', 2)); const on = document.createElement('span'); on.className = 'k7-t16'; ords.append(on);
    const job = div('trs-gi'); const jg = document.createElement('span'); const jt = document.createElement('span'); jt.className = 'k7-t16 trs-job'; job.append(jg, jt);
    tally.append(kills, ords, job);
    D.info.append(head, bars, gear, tally);
    let lastJ = '';
    const upd = () => {
      const st = this.book.stateOf(t), nd = t.needs(st);
      paint(hpC, t.hp01, hpRamp(t.hp01)); paint(moC, st.morale, st.morale < 0.25 ? P.ruby : st.morale < 0.5 ? P.glowAmber : P.sapphire);
      for (const k of ['food', 'rest', 'maint'] as const) { const cv = needC[k], v0 = nd[k]; if (cv && v0 !== null) paint(cv, v0, v0 < 0.25 ? P.ruby : v0 < 0.5 ? P.glowAmber : P.malachite); }
      kn.textContent = String(st.kills); on.textContent = String(st.orders);
      const j = this.book.job(t); if (j !== lastJ) { lastJ = j; jt.textContent = j; jg.innerHTML = ''; jg.append(glyphCanvas(jobGlyph(j), 'amber', 2)); }
      this.history(t); this.woundList(t);
    };
    (upd as { det?: boolean }).det = true;
    upd(); this.live.push(upd);
    for (const m of this.squadsCol.querySelectorAll('.trs-mem')) m.classList.toggle('sel', (m as HTMLElement).dataset.key === t.key);
  }
  /** health (green) and morale (blue) over the last minutes, in a glass well */
  private history(t: Troop) {
    const cv = this.det!.hist, W = cv.width, H = cv.height, p = new Px(W, H);
    glassWell(p, 1, 1, W - 2, H - 2, 0x0b1214, { glare: true });
    for (let x = 6; x < W - 3; x += 12) for (let y = 4; y < H - 3; y += 2) p.set(x, y, 0x1a2a2c);
    for (let y = 8; y < H - 3; y += 14) for (let x = 3; x < W - 3; x += 2) p.set(x, y, 0x1a2a2c);
    const s = this.book.stateOf(t), hs = [...s.hist, { t: this.book.now, hp: t.hp01, mor: s.morale }];
    const n = hs.length, x0 = 4, w = W - 9, y0 = 4, h = H - 9;
    const plot = (f: (q: typeof hs[number]) => number, c0: number, c1: number) => {
      let px = -1, py = -1;
      hs.forEach((q, i) => { const x = Math.round(x0 + (n <= 1 ? w : (i / (n - 1)) * w)), y = Math.round(y0 + (1 - f(q)) * h); if (px >= 0) { p.line(px, py + 1, x, y + 1, c0); p.line(px, py, x, y, c1); } px = x; py = y; });
      if (px >= 0) { p.rect(px - 1, py - 1, 3, 3, INK); p.set(px, py, 0xffffff); }
    };
    plot((q) => q.mor, P.sapphire[1], P.sapphire[4]);
    plot((q) => q.hp, P.malachite[1], P.malachite[4]);
    p.canvas(cv);
  }
  private wKey = '';
  private woundList(t: Troop) {
    const s = this.book.stateOf(t), ws = s.wounds.slice(-6).reverse(), key = t.key + ws.map((w) => w.t.toFixed(0) + w.dmg.toFixed(0)).join(',');
    if (key === this.wKey) return; this.wKey = key;
    const box = this.det!.wounds; box.innerHTML = '';
    if (!ws.length) { const e = div('trs-gi'); e.append(glyphCanvas('heart', 'green', 2)); box.append(e); return; }
    for (const w of ws) {
      const r = div('trs-gi wound');
      const src = w.src === 'o2' ? 'o2' : w.src === 'hunger' ? 'hunger' : /shell|mortar|tank|titan|heavy|artillery|walker/.test(w.src) ? 'shell' : /rocket|mech/.test(w.src) ? 'rocket' : w.src === 'claw' ? 'claw' : 'hit';
      r.append(glyphCanvas(src, 'red', 2));
      const n = document.createElement('span'); n.className = 'k7-t16'; n.textContent = '-' + Math.max(1, Math.round(w.dmg)); r.append(n);
      const a = document.createElement('span'); a.className = 'k7-t16 trs-age'; const m = Math.max(0, (this.book.now - w.t) / 60); a.textContent = m < 1 ? Math.round(m * 60) + 's' : Math.round(m) + 'm'; r.append(a);
      box.append(r);
    }
  }

  // ------------------------------------------------------------------ the survey map
  private buildMap() {
    const pn = panel({ tone: 'steel', seed: 88, head: 14, foot: 12, side: 10, lamps: [], hazard: false, cls: 'trs-map' }); this.panels.push(pn);
    const p = pn.body;
    const cv = document.createElement('canvas'); cv.className = 'trs-mapcv';
    const R = this.g.region, N = R?.N ?? 128, size = 264;
    this.mapK = size / N;
    cv.width = size; cv.height = size; cv.style.width = size * 2 / 2 * 1.0 + 'px';
    try { const k = Math.max(0.5, Math.min(2, size / N)); const pt = paintTerrain(R, R.pal, k); this.mapBase = pt.px.canvas(); this.mapK = pt.px.w / N; cv.width = pt.px.w; cv.height = pt.px.h; } catch (e) { console.warn('troops map', e); }
    const scale = Math.max(1, Math.floor(300 / cv.width));
    cv.style.width = cv.width * scale + 'px'; cv.style.height = cv.height * scale + 'px';
    cv.addEventListener('pointerdown', (e) => {
      const r = cv.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * cv.width / this.mapK, z = ((e.clientY - r.top) / r.height) * cv.height / this.mapK;
      if (this.armArea !== null) {
        const sq = this.book.squad(this.armArea);
        if (sq) { sq.area = { x, z, r: 9 }; uiSfx('clunk', 0.5); placeDust(e.clientX, e.clientY, 0.2, { ground: 'dirt', layer: 'ui' }); this.book.save(); }
        this.armArea = null; cv.classList.remove('arm'); this.buildSquads();
      } else { this.g.cam?.lookAt?.(x, z); uiSfx('tick', 0.4); }
    });
    p.append(cv); this.mapCv = cv;
    this.detailCol.append(pn.el);
  }
  private mapT = 0;
  private drawMap() {
    const cv = this.mapCv; if (!cv) return;
    this.mapT += 1 / 60;
    const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, cv.width, cv.height);
    if (this.mapBase) c.drawImage(this.mapBase, 0, 0);
    const K = this.mapK;
    // squads' areas: a ring in their colour, a pin at the centre
    for (const sq of this.book.squads) {
      if (!sq.area) continue;
      const a = sq.area, cx = a.x * K, cz = a.z * K, r = a.r * K;
      c.fillStyle = hex(sq.color);
      for (let i = 0; i < 48; i++) { if (i % 2) continue; const an = (i / 48) * Math.PI * 2 + this.mapT * 0.4; c.fillRect(Math.round(cx + Math.sin(an) * r), Math.round(cz + Math.cos(an) * r), 2, 2); }
      c.fillStyle = '#08090c'; c.fillRect(Math.round(cx) - 2, Math.round(cz) - 6, 5, 7); c.fillStyle = hex(sq.color); c.fillRect(Math.round(cx) - 1, Math.round(cz) - 5, 3, 5);
    }
    // the pod and the units
    const pod = this.g.colony?.pod;
    if (pod) { c.fillStyle = '#08090c'; c.fillRect(Math.round(pod.x * K) - 3, Math.round(pod.z * K) - 3, 7, 7); c.fillStyle = '#f2ead2'; c.fillRect(Math.round(pod.x * K) - 2, Math.round(pod.z * K) - 2, 5, 5); }
    for (const t of this.book.troops) {
      const sq = this.book.squad(this.book.stateOf(t).squad), x = Math.round(t.x * K), z = Math.round(t.z * K);
      c.fillStyle = '#08090c'; c.fillRect(x - 2, z - 2, 4, 4);
      c.fillStyle = t === this.detailT ? '#ffffff' : sq ? hex(sq.color) : '#c8c0a0'; c.fillRect(x - 1, z - 1, 2, 2);
    }
  }

  // ------------------------------------------------------------------ production
  private buildProduction() {
    const col = this.prodCol; col.innerHTML = '';
    // THE ROBOT FOUNDRY
    const fpn = panel({ tone: 'gun', seed: 91, title: 'FOUNDRY', serial: 'RF-07', lamps: ['green', 'amber'], hazard: true, vents: true, cls: 'trs-prod fdy' }); this.panels.push(fpn);
    const fp = fpn.body;
    const fs = this.foundry.foundries();
    if (!fs.length) {
      const lock = div('trs-lock'); lock.append(glyphCanvas('stop', 'dim', 4));
      const why = this.g.unlocks?.lockLine?.('robotfab') ?? null;
      const l = document.createElement('span'); l.className = 'k7-t16'; l.textContent = why ?? 'BUILD A ROBOT FOUNDRY'; lock.append(l);
      fp.append(lock);
    } else {
      const b = fs[0];
      const now = div('trs-now');
      const cur = div('trs-cur');
      let curKind = '', cv0: ModelView | null = null;
      const bar = document.createElement('canvas'); bar.width = 120; bar.height = 9; bar.style.width = '240px'; bar.style.height = '18px'; bar.className = 'trs-pbar';
      const st = document.createElement('span'); st.className = 'k7-t16 trs-pst';
      now.append(cur, bar, st);
      const qrow = div('trs-queue');
      fp.append(now, qrow);
      const opts = div('trs-opts');
      const recs = recipesAt('robotfab').filter((r: any) => this.g.factory?.recipeOk?.(r) ?? true);
      for (const r of recs) opts.append(this.robotOpt(b, r, () => drawQ()));
      fp.append(opts);
      const drawQ = () => {
        qrow.innerHTML = '';
        const q = this.foundry.queue(b);
        for (let i = 0; i < QMAX; i++) {
          const s = div('trs-slot');
          const rid = q[i];
          if (rid) { const kind = RECIPE[rid]?.robot as string; s.append(this.robotStill(kind, 22)); s.title = RECIPE[rid]?.name ?? rid; s.addEventListener('click', () => { this.foundry.remove(b, i); uiSfx('back', 0.4); drawQ(); }); }
          else s.classList.add('empty');
          qrow.append(s);
        }
      };
      drawQ();
      const upd = () => {
        const kind = (b.recipe?.robot as string | undefined) ?? '';
        if (kind !== curKind) { curKind = kind; if (cv0) { cv0.dispose(); this.views.splice(this.views.indexOf(cv0), 1); cv0 = null; } cur.innerHTML = ''; if (kind) { let v: ModelView | null = null; v = new ModelView(bareBuild(() => robotBody(kind)), { w: 64, h: 56, scale: 2, spin: 0.6, pitch: 0.35, zoom: 1.05, anim: (root) => holdLights(root, v?.yaw ?? 0) }); cv0 = v; this.views.push(v); cur.append(v.cv); } else cur.append(glyphCanvas('build', 'dim', 4)); }
        const pb = new Px(120, 9); cellBar(pb, 1, 1, 118, 7, b.running ? b.prog ?? 0 : 0, P.glowAmber, performance.now() / 1000); pb.canvas(bar);
        st.textContent = String(b.status ?? '').toUpperCase();
        fpn.lamp(0, !!b.running); fpn.lamp(1, b.status === 'starved' || b.status === 'blocked' || b.status === 'nopower');
        if (qrow.children.length && this.foundry.queue(b).length !== [...qrow.children].filter((c) => !c.classList.contains('empty')).length) drawQ();
      };
      upd(); this.live.push(upd);
    }
    col.append(fpn.el);
    // THE LAB: the designs the colony can print
    const lpn = panel({ tone: 'cream', seed: 97, title: 'LAB', lamps: ['teal'], hazard: false, cls: 'trs-prod lab' }); this.panels.push(lpn);
    const lp = lpn.body;
    const hive = this.g.veyr;
    const ds: any[] = hive?.designs?.() ?? [];
    const grid = div('trs-opts');
    if (!ds.length) { const lock = div('trs-lock'); lock.append(glyphCanvas('part', 'dim', 4)); const l = document.createElement('span'); l.className = 'k7-t16'; l.textContent = 'NO DESIGNS YET'; lock.append(l); lp.append(lock); }
    ds.slice(0, 8).forEach((sp, i) => grid.append(this.designOpt(sp, i)));
    lp.append(grid);
    col.append(lpn.el);
  }
  private robotStill(kind: string, w: number): HTMLCanvasElement {
    const v = new ModelView(bareBuild(() => robotBody(kind)), { w, h: w, scale: 2, spin: 0, rock: 0.2, pitch: 0.35, zoom: 1.1 });
    this.views.push(v); return v.cv;
  }
  private robotOpt(b: any, r: any, after: () => void): HTMLElement {
    const kind = r.robot as string;
    const wrap = div('trs-opt');
    let fi: ReturnType<typeof floatIcon> | null = null;
    fi = floatIcon({ build: bareBuild(() => robotBody(kind)), name: String(r.name ?? kind).toUpperCase().slice(0, 9), size: [44, 40], scale: 2, nameSize: 16, sound: '', view: { pitch: 0.35, spin: 0, yaw0: 0.6, zoom: 1.05, anim: (root) => holdLights(root, fi?.view?.yaw ?? 0) },
      onClick: () => { if (this.foundry.add(b, r.id)) { uiSfx('confirm', 0.5); pop(wrap, 0.5); after(); } else { uiSfx('error', 0.5); shake(wrap, 5); } } });
    wrap.append(fi.el);
    if (fi.view) this.views.push(fi.view);
    wrap.append(this.bill(r.in ?? {}));
    return wrap;
  }
  private designOpt(sp: any, i: number): HTMLElement {
    const wrap = div('trs-opt');
    const hive = this.g.veyr;
    let fi: ReturnType<typeof floatIcon> | null = null;
    fi = floatIcon({ build: bareBuild(() => speciesBody(this.g, sp)), name: String(sp.name ?? 'DESIGN').toUpperCase().slice(0, 9), size: [44, 40], scale: 2, nameSize: 16, sound: '', view: { pitch: 0.3, spin: 0, yaw0: 0.7, zoom: 1.05, anim: (root) => holdLights(root, fi?.view?.yaw ?? 0) },
      onClick: () => {
        const why = hive?.whyPrint?.(i);
        if (why) { uiSfx('error', 0.5); shake(wrap, 5); return; }
        const c = hive.print(i);
        if (c) { uiSfx('confirm', 0.55); pop(wrap, 0.6); } else { uiSfx('error', 0.5); shake(wrap, 5); }
      } });
    wrap.append(fi.el);
    if (fi.view) this.views.push(fi.view);
    let cost: Record<string, number> = {}; try { cost = hive?.printCost?.(sp) ?? {}; } catch { /* */ }
    wrap.append(this.bill(cost));
    return wrap;
  }
  /** a bill of items: each item's icon and the count (dimmed when the stores are short) */
  private bill(cost: Record<string, number>): HTMLElement {
    const row = div('trs-bill');
    for (const [id, n] of Object.entries(cost).slice(0, 4)) {
      const it = div('trs-bi');
      const img = document.createElement('img'); img.draggable = false; try { img.src = itemIcon(id as never, 32); } catch { /* unknown item */ } img.width = 32; img.height = 32;
      const have = this.g.factory?.count?.(id) ?? 0;
      const c = document.createElement('span'); c.className = 'k7-t16'; c.textContent = String(n); if (have < (n ?? 0)) it.classList.add('short');
      it.append(img, c); row.append(it);
    }
    return row;
  }
}

const div = (cls: string) => { const d = document.createElement('div'); d.className = cls; return d; };
function paint(cv: HTMLCanvasElement, v: number, ramp: readonly number[]) { const p = new Px(cv.width, cv.height); cellBar(p, 1, 1, cv.width - 2, cv.height - 2, v, ramp, performance.now() / 1000); p.canvas(cv); }
const robotCache = new Map<string, THREE.Object3D>();
/** a robot kind's body in the Corps' livery (shared; a clone per view) */
function robotBody(kind: string): THREE.Object3D | null {
  let m = robotCache.get(kind);
  if (!m) { try { m = buildModel(kind as never, liveryFor('veyr')).root; robotCache.set(kind, m); } catch (e) { console.warn('robot model', kind, e); return null; } }
  return m.clone();
}
/** a species design's body (an animal of it in the world when there is one, else built from the design) */
function speciesBody(g: G, sp: any): THREE.Object3D | null {
  const live = (g.world?.creatures ?? []).find((c: any) => c.sp === sp && !c.dead);
  if (live?.mesh) { const s = new THREE.Group(); const m = new THREE.Mesh(live.mesh.geometry, live.mesh.material); s.add(m); return s; }
  try { const md = buildSpeciesModel(sp.design); const inst = makeInstance(md); const s = new THREE.Group(); s.add(new THREE.Mesh(inst.mesh.geometry, inst.mesh.material)); return s; } catch (e) { console.warn('design model', e); }
  const s = new THREE.Group(); s.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), toon({ map: tex('olive') }))); return s;
}

let css = false;
function injectCSS() {
  if (css) return; css = true;
  const s = document.createElement('style');
  s.textContent = `
.trs { position: fixed; inset: 0; z-index: 9350; display: flex; align-items: center; justify-content: center; background: radial-gradient(ellipse at 50% 42%, rgba(14,16,14,.78), rgba(6,7,8,.96)); }
.trs-board { position: relative; width: 1840px; height: 1000px; }
.trs-hd { position: absolute; left: 8px; top: 0; height: 70px; display: flex; align-items: center; gap: 26px; }
.trs-count { display: flex; align-items: center; gap: 8px; }
.trs-count canvas, .trs canvas { image-rendering: pixelated; }
.trs-count .k7-t32 { color: #ffe7a8; }
.trs-back { position: absolute !important; right: 6px; top: -6px; }
.trs-col { position: absolute; top: 78px; bottom: 0; display: flex; flex-direction: column; gap: 12px; }
.trs-col.a { left: 0; width: 610px; }
.trs-col.b { left: 628px; width: 584px; }
.trs-col.c { left: 1230px; width: 610px; }
.trs-sq { position: relative; height: 188px; transition: transform .16s cubic-bezier(.3,1.6,.5,1), filter .16s; flex: none; }
.trs-sq.pool { flex: 1; min-height: 150px; }
.trs-sq > .kp-body { display: flex; flex-direction: column; height: 100%; }
.trs-sq.drop { transform: translateY(-3px); filter: brightness(1.18) drop-shadow(0 0 8px rgba(255,210,120,.55)); }
.trs-sq-top { display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 4px; }
.trs-name { position: relative; display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px; width: 250px; }
.trs-name.pool { width: auto; padding: 0 4px; }
.trs-name.pool .k7-t32 { color: #c8bfa0; }
.trs-swatch { display: inline-block; width: 12px; height: 12px; position: relative; z-index: 1; box-shadow: 0 0 0 2px #08090c; }
.trs-in { position: absolute; z-index: 3; left: 25px; top: 3px; width: 170px; height: 22px; border: 0; outline: 0; padding: 0 0 0 12px; background: transparent; color: transparent; caret-color: #1a1408; cursor: text; text-shadow: none !important; }
.trs-in:focus { background: #e2c254; color: #1a1408; box-shadow: 0 0 0 2px #08090c, 0 0 10px rgba(255,210,110,.7); }
.trs-stance { display: flex; gap: 2px; margin-left: 6px; }
.trs-st, .trs-area, .trs-go, .trs-add { position: relative; border: 0; background: none; padding: 2px; cursor: pointer; line-height: 0; transition: transform .16s cubic-bezier(.3,1.6,.5,1), filter .16s; filter: saturate(.35) brightness(.7) drop-shadow(0 3px 0 rgba(0,0,0,.35)); }
.trs-st:hover, .trs-area:hover, .trs-go:hover, .trs-add:hover { transform: translateY(-4px); filter: saturate(.8) brightness(1.05) drop-shadow(0 5px 0 rgba(0,0,0,.3)); }
.trs-st.on { filter: brightness(1.2) drop-shadow(0 0 6px rgba(255,200,110,.9)) drop-shadow(0 3px 0 rgba(0,0,0,.35)); transform: translateY(-2px); }
.trs-area.set { filter: brightness(1.1) drop-shadow(0 3px 0 rgba(0,0,0,.35)); }
.trs-area.arm { animation: trs-pulse .6s ease-in-out infinite alternate; }
@keyframes trs-pulse { to { transform: translateY(-5px); filter: brightness(1.4) drop-shadow(0 0 8px rgba(255,210,120,.9)); } }
.trs-go { margin-left: auto; filter: brightness(.95) drop-shadow(0 3px 0 rgba(0,0,0,.35)); }
.trs-add { align-self: center; margin: -6px 0 -6px; filter: brightness(.9) drop-shadow(0 3px 0 rgba(0,0,0,.4)); }
.trs-members { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0 4px; flex: 1; padding-top: 4px; }
.trs-mem { position: relative; width: 60px; height: 84px; cursor: grab; transition: transform .16s cubic-bezier(.3,1.6,.5,1), opacity .15s; }
.trs-mem:hover { transform: translateY(-5px); }
.trs-mem.lifted { opacity: .35; }
.trs-mem.sel::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: 14px; height: 4px; background: #ffe7a8; box-shadow: 0 0 0 2px #08090c; }
.trs-mem canvas.k7-model { position: absolute; left: 0; top: 0; }
.trs-mem .trs-mem-sh { position: absolute; left: 8px; top: 58px; }
.trs-mem .trs-mbar { position: absolute; left: 4px; bottom: 0; }
.trs-ghost { position: fixed; z-index: 9500; pointer-events: none; width: 60px; height: 68px; image-rendering: pixelated; filter: drop-shadow(0 10px 6px rgba(0,0,0,.5)); transform: rotate(-6deg) scale(1.15); }
.trs-empty { opacity: .45; align-self: center; margin: 0 auto; }
.trs-more { color: #ffe7a8; align-self: center; margin-left: 6px; }
.trs-detail { position: relative; height: 560px; flex: none; }
.trs-detail > .kp-body { height: 100%; }
.trs-dport { position: absolute !important; left: 0; top: 0; width: 240px; height: 224px; cursor: pointer; }
.trs-dport canvas.k7-model { position: absolute; left: 0; top: 0; }
.trs-dport .trs-dport-sh { position: absolute; left: 30px; bottom: 6px; }
.trs-dinfo { position: absolute !important; left: 250px; top: 2px; right: 4px; display: flex; flex-direction: column; gap: 10px; }
.trs-dcall { color: #f6ecd0; }
.trs-dtype { color: var(--k7-dim); margin-top: -8px; }
.trs-dbars { display: flex; flex-direction: column; gap: 6px; }
.trs-g { display: flex; align-items: center; gap: 8px; }
.trs-g canvas { display: block; }
.trs-gear, .trs-tally { display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; }
.trs-gi { display: inline-flex; align-items: center; gap: 6px; }
.trs-gi canvas { display: block; }
.trs-gi .k7-t16 { color: #f2ead2; }
.trs-job { color: #ffd98a !important; }
.trs-hist { position: absolute !important; left: 2px; right: 2px; top: 236px; height: 126px; }
.trs-hist canvas { display: block; }
.trs-wounds { position: absolute !important; left: 6px; right: 6px; top: 376px; bottom: 4px; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 10px 22px; }
.trs-gi.wound .k7-t16 { color: #ff9a80; }
.trs-age { color: var(--k7-dim) !important; }
.trs-map { position: relative; flex: 1; }
.trs-map > .kp-body { height: 100%; display: flex; align-items: center; justify-content: center; }
.trs-mapcv { position: relative; z-index: 1; image-rendering: pixelated; cursor: crosshair; box-shadow: 0 0 0 2px #08090c, 0 0 0 4px #6a6e70; }
.trs-mapcv.arm { box-shadow: 0 0 0 2px #08090c, 0 0 0 4px #ffc560, 0 0 16px rgba(255,200,100,.6); }
.trs-prod { position: relative; flex: none; }
.trs-prod.fdy { height: 540px; }
.trs-prod.lab { flex: 1; }
.trs-lock { display: flex; align-items: center; gap: 12px; padding: 18px 6px; opacity: .85; }
.trs-lock .k7-t16 { color: #c8bfa0; }
.trs-now { display: grid; grid-template-columns: 128px 1fr; grid-template-rows: 1fr auto; align-items: center; column-gap: 14px; height: 120px; }
.trs-cur { grid-row: 1 / 3; width: 128px; height: 112px; display: flex; align-items: center; justify-content: center; }
.trs-pbar { align-self: end; }
.trs-pst { color: #ffd98a; align-self: start; margin-top: 6px; }
.trs-queue { display: flex; gap: 8px; margin: 6px 0 8px 4px; height: 50px; }
.trs-slot { width: 46px; height: 46px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: radial-gradient(closest-side, rgba(0,0,0,.42), rgba(0,0,0,0)); }
.trs-slot.empty { cursor: default; background: radial-gradient(closest-side, rgba(0,0,0,.28), rgba(0,0,0,0)); }
.trs-slot.empty::after { content: ''; width: 10px; height: 10px; background: #2a2e30; box-shadow: 0 0 0 2px #08090c, inset 1px 1px 0 #4a5052; }
.trs-opts { display: flex; flex-wrap: wrap; gap: 4px 6px; }
.trs-opt { display: flex; flex-direction: column; align-items: center; width: 136px; }
.trs-opt .k7-fi { width: 128px; }
.trs-opt .k7-name { white-space: nowrap; }
.trs-bill { display: flex; gap: 2px; margin-top: 2px; }
.trs-bi { display: inline-flex; align-items: center; gap: 0; }
.trs-bi img { image-rendering: pixelated; display: block; }
.trs-bi .k7-t16 { color: #f2ead2; margin-left: -4px; }
.trs-bi.short .k7-t16 { color: #ff8a70; }
`;
  document.head.append(s);
}
