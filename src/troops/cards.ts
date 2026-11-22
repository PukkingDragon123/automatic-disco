// TROOPS · UNIT CARDS. When units are selected the dock sinks away and the field card rises in its place: a worn
// gunmetal plate (the kit's plate over the MATERIAL LIBRARY, screws and rivets) carrying the selection.
//   ONE UNIT: its portrait (a clone of its own live model, outlined, turning on a machined plinth), its callsign,
//   health and morale in glass cell bars, its needs (food or charge, rest, maintenance or suit) as small gauges, its
//   current job as a glyph and a word, its squad's brass tag.
//   MANY: the portraits stand on the plate grouped by type (count over each group), each with its health pips;
//   click one to take it alone, shift-click to drop it, ctrl-click to take its type.
//   ORDER KEYS: physical keycaps (art.ts keyModel) with the glyph in relief: ATTACK-MOVE (A), STOP (S), HOLD (H),
//   PATROL (P), and the formations LINE / WEDGE / COLUMN (F cycles). They press in 3D, latch while armed or chosen.
//   CONTROL GROUPS: brass tags along the plate's top edge (1-9 with their size); click recalls.
import type { Game } from '../game/game';
import type { Troop } from './units';
import type { Rts } from './rts';
import type { OrderBook, Formation } from './orders';
import { skin, strip, pxCanvas, shadowBlob } from '../ui/kit/mat';
import { panel, type Panel } from '../ui/kit/panel';
import { Px, cellBar, P } from '../ui/kit/px';
import { ModelView } from '../ui/kit/model3d';
import { floatIcon, type FloatIcon } from '../ui/kit/floatIcon';
import { uiSfx } from '../ui/kit/sound';
import { pop, squash, onFrame } from '../ui/kit/juice';
import { DOCK_MODELS } from '../ui/kit/models';
import { glyphCanvas, glyph, keyModel, portraitBuild, holdLights, pip, hpRamp } from './art';

type G = Game & Record<string, any>;
const JOB_GLYPH: [RegExp, string][] = [[/ENGAG|ATTACK|ADVANC|DEFEND/, 'attack'], [/MOV|FLY|EN ROUTE|RETURN|FALL/, 'move'], [/GUARD/, 'guard'], [/PATROL/, 'patrol'], [/HOLD|STANDBY|STOP|HOVER|DOCK/, 'hold'], [/HAUL|GATHER|MIN|FORAG|SAMPL|WORK/, 'gather'], [/BUILD|CONSTR/, 'build'], [/REPAIR|WELD/, 'repair'], [/FOLLOW/, 'follow'], [/EAT|SLEEP|REFILL|CHARG|REST/, 'rest']];
export function jobGlyph(j: string) { for (const [re, g] of JOB_GLYPH) if (re.test(j)) return g; return 'hold'; }
const TYPE_GLYPH: Record<string, string> = { robot: 'gun', worker: 'claw', crew: 'suit', drone: 'scan' };

export class Cards {
  readonly el: HTMLDivElement;
  private pan: Panel;
  private body: HTMLDivElement; private keysEl: HTMLDivElement; private groupsEl: HTMLDivElement;
  private views: ModelView[] = [];
  private keys = new Map<string, FloatIcon>();
  private shown = false; private key = '';
  private live: (() => void) | null = null;
  private liveT = 0;
  constructor(readonly g: G, readonly rts: Rts, readonly book: OrderBook) {
    injectCSS();
    const el = this.el = document.createElement('div'); el.className = 'tr-cards';
    // the kit's standard housing: a gunmetal box, lamps on the hood, the selection sunk in its dark well
    this.pan = panel({ tone: 'gun', seed: 41, head: 20, foot: 14, side: 10, lamps: ['green', 'amber', 'red'], hazard: true, guards: true, cls: 'tr-plate' });
    const pl = this.pan.body; el.append(this.pan.el);
    this.groupsEl = document.createElement('div'); this.groupsEl.className = 'tr-groups'; el.append(this.groupsEl);
    this.body = document.createElement('div'); this.body.className = 'tr-body'; pl.append(this.body);
    this.keysEl = document.createElement('div'); this.keysEl.className = 'tr-keys'; pl.append(this.keysEl);
    this.buildKeys();
    // the roster: the TROOPS screen from the card (the dock is down while units are selected)
    const ros = floatIcon({ build: DOCK_MODELS.troops, name: '', size: [30, 26], scale: 2, sound: 'open', view: { pitch: 0.5, spin: 0, yaw0: 0.5, zoom: 1.3, lift: 0.03 }, onClick: (e) => { e.stopPropagation(); void this.g.dock?.open?.('troops'); }, aria: 'TROOPS' });
    ros.el.classList.add('tr-roster'); el.append(ros.el);
    document.body.append(el);
    rts.onChange = () => this.refresh();
    rts.onGroups = () => this.drawGroups();
    rts.onKeyOrder = (k) => this.pressed(k);
    onFrame((dt) => { this.tick(dt); return true; });
  }
  // ------------------------------------------------------------------ the order keys
  private buildKeys() {
    const row1 = document.createElement('div'), row2 = document.createElement('div');
    row1.className = row2.className = 'tr-krow';
    const K = (id: string, glyphName: string, name: string, cap: Parameters<typeof keyModel>[1]['cap'], act: () => void, row: HTMLElement) => {
      const fi = floatIcon({ build: keyModel(glyphName, { cap }), name, size: [36, 32], scale: 2, nameSize: 16, sound: '', view: { pitch: 0.95, spin: 0, yaw0: 0.3, rock: 0.18, hotSpin: 0.7, zoom: 1.12, lift: 0.02 }, onClick: (e) => { e.stopPropagation(); act(); }, aria: id });
      fi.el.classList.add('tr-key'); fi.el.dataset.key = id;
      row.append(fi.el); this.keys.set(id, fi);
    };
    K('amove', 'attack', 'A', 'red', () => this.rts.cmd('amove'), row1);
    K('stop', 'stop', 'S', 'gun', () => this.rts.cmd('stop'), row1);
    K('hold', 'hold', 'H', 'olive', () => this.rts.cmd('hold'), row1);
    K('patrol', 'patrol', 'P', 'teal', () => this.rts.cmd('patrol'), row1);
    for (const f of ['line', 'wedge', 'column'] as Formation[]) K(f, f, '', 'brass', () => this.rts.setFormation(f), row2);
    this.keysEl.append(row1, row2);
    this.syncKeys();
  }
  private syncKeys() {
    for (const f of ['line', 'wedge', 'column']) this.keys.get(f)?.setOn(this.book.formation === f);
    this.keys.get('amove')?.setOn(this.rts.arm === 'amove'); this.keys.get('patrol')?.setOn(this.rts.arm === 'patrol');
  }
  /** a key was used from the keyboard: the cap presses too */
  private pressed(k: string) {
    const fi = this.keys.get(k);
    if (fi) { fi.el.classList.add('down'); fi.view?.press(1.2); fi.view?.poke(4); setTimeout(() => fi.el.classList.remove('down'), 140); }
    this.syncKeys();
    if (k.startsWith('group')) { const t = this.groupsEl.querySelector(`[data-g="${k.slice(5)}"]`) as HTMLElement | null; if (t) pop(t, 0.8); }
    // the selection reacts: every portrait nods
    if (k === 'stop' || k === 'hold' || k === 'amove' || k === 'patrol') for (const v of this.views) { v.press(0.8); }
  }
  /** an order was given (orders.ts): the portraits react */
  ordered() { for (const v of this.views) { v.press(0.9); v.poke(5); } }

  // ------------------------------------------------------------------ the selection
  refresh() {
    const sel = this.rts.troops();
    const key = sel.map((t) => t.key).join(',');
    if (key === this.key) return;
    this.key = key;
    const show = sel.length > 0;
    if (show !== this.shown) {
      this.shown = show;
      document.body.classList.toggle('tr-cards-on', show);
      this.el.classList.toggle('on', show);
      uiSfx(show ? 'swishIn' : 'swishOut', 0.35, show ? 1.05 : 0.95);
    }
    if (!show) { this.clear(); return; }
    this.clear();
    if (sel.length === 1) this.one(sel[0]); else this.many(sel);
    pop(this.body, 0.25);
    this.drawGroups();
    this.syncKeys();
  }
  private clear() { for (const v of this.views) v.dispose(); this.views = []; this.body.innerHTML = ''; this.live = null; }
  private view(t: Troop, w: number, h: number, scale: number, plinth: boolean, o: { spin?: number; zoom?: number; pitch?: number } = {}) {
    let v: ModelView | null = null;
    v = new ModelView(portraitBuild(t, { plinth }), { w, h, scale, spin: o.spin ?? 0, rock: 0.5, yaw0: 0.55, hotSpin: 1.6, pitch: o.pitch ?? 0.32, zoom: o.zoom ?? 1.05, shadow: [2, 2, 0.35], anim: (root) => holdLights(root, v?.yaw ?? 0) });
    this.views.push(v);
    return v;
  }
  private one(t: Troop) {
    const s = this.book.stateOf(t);
    const wrap = document.createElement('div'); wrap.className = 'tr-one';
    const port = document.createElement('div'); port.className = 'tr-port';
    const v = this.view(t, 92, 84, 2, true, { spin: 0.35, zoom: 1.0 });
    port.append(pxCanvas(shadowBlob(70, 10, 0.5), 2, 'tr-port-sh'), v.cv);
    port.addEventListener('pointerenter', () => v.hot(true)); port.addEventListener('pointerleave', () => v.hot(false));
    port.addEventListener('pointermove', (e) => v.point(e.clientX, e.clientY));
    port.addEventListener('click', () => { v.poke(10); this.rts.focus([t]); });
    const info = document.createElement('div'); info.className = 'tr-info';
    const head = document.createElement('div'); head.className = 'tr-head';
    head.append(glyphCanvas(TYPE_GLYPH[t.kind] ?? 'troops', 'brass', 2));
    const nm = document.createElement('span'); nm.className = 'k7-t32 tr-call'; nm.textContent = s.call; head.append(nm);
    const sq = this.book.squad(s.squad);
    if (sq) { const tag = document.createElement('span'); tag.className = 'tr-sqtag'; skin(tag, (w, h) => strip(w, h, 'brass', 7 + sq.id)); const tx = document.createElement('span'); tx.className = 'k7-t16'; tx.textContent = sq.name; tag.append(tx); head.append(tag); }
    const ty = document.createElement('div'); ty.className = 'k7-t16 tr-type'; ty.textContent = t.typeName;
    // gauges: health, morale (glass cell bars), the needs, the job
    const bar = (icon: string, pal: string, w: number) => { const row = document.createElement('div'); row.className = 'tr-g'; row.append(glyphCanvas(icon, pal as never, 2)); const cv = document.createElement('canvas'); cv.className = 'tr-bar'; cv.width = w; cv.height = 8; cv.style.width = w * 2 + 'px'; cv.style.height = '16px'; row.append(cv); return { row, cv }; };
    const hpB = bar('heart', 'red', 74), moB = bar('morale', 'blue', 74);
    const gauges = document.createElement('div'); gauges.className = 'tr-gauges'; gauges.append(hpB.row, moB.row);
    const n0 = t.needs(s);
    const needIcon = { food: t.kind === 'robot' || t.kind === 'drone' ? 'battery' : 'food', rest: 'rest', maint: t.kind === 'crew' ? 'suit' : 'maint' } as const;
    const needs = document.createElement('div'); needs.className = 'tr-needs';
    const nb: Partial<Record<'food' | 'rest' | 'maint', HTMLCanvasElement>> = {};
    for (const k of ['food', 'rest', 'maint'] as const) { if (n0[k] === null) continue; const b = bar(needIcon[k], 'cream', 30); b.row.classList.add('tr-need'); needs.append(b.row); nb[k] = b.cv; }
    const job = document.createElement('div'); job.className = 'tr-job';
    const jg = document.createElement('span'); const jt = document.createElement('span'); jt.className = 'k7-t16'; job.append(jg, jt);
    info.append(head, ty, gauges, needs, job);
    wrap.append(port, info);
    this.body.append(wrap);
    let lastJob = '', lastG = '';
    this.live = () => {
      const st = this.book.stateOf(t), nd = t.needs(st);
      paintBar(hpB.cv, t.hp01, hpRamp(t.hp01), this.liveT);
      paintBar(moB.cv, st.morale, st.morale < 0.25 ? P.ruby : st.morale < 0.5 ? P.glowAmber : P.sapphire, this.liveT);
      for (const k of ['food', 'rest', 'maint'] as const) { const cv = nb[k]; const v0 = nd[k]; if (cv && v0 !== null) paintBar(cv, v0, v0 < 0.25 ? P.ruby : v0 < 0.5 ? P.glowAmber : P.malachite, 0); }
      const j = this.book.job(t);
      if (j !== lastJob) { lastJob = j; jt.textContent = j; const gn = jobGlyph(j); if (gn !== lastG) { lastG = gn; jg.innerHTML = ''; jg.append(glyphCanvas(gn, 'amber', 2)); } pop(job, 0.3); }
    };
    this.live();
  }
  private many(sel: Troop[]) {
    const wrap = document.createElement('div'); wrap.className = 'tr-many';
    const by = new Map<string, Troop[]>();
    for (const t of sel) { const a = by.get(t.type) ?? []; a.push(t); by.set(t.type, a); }
    const groups = [...by.values()].sort((a, b) => b.length - a.length);
    const MAX = 22; let n = 0;
    const bars: { t: Troop; cv: HTMLCanvasElement }[] = [];
    for (const list of groups) {
      if (n >= MAX) break;
      const grp = document.createElement('div'); grp.className = 'tr-grp';
      const hd = document.createElement('div'); hd.className = 'tr-grp-h';
      hd.append(glyphCanvas(TYPE_GLYPH[list[0].kind] ?? 'troops', 'brass', 2));
      const cnt = document.createElement('span'); cnt.className = 'k7-t16'; cnt.textContent = '×' + list.length; hd.append(cnt);
      hd.title = list[0].typeName;
      hd.addEventListener('click', (e) => { this.rts.select(list, e.shiftKey); uiSfx('select', 0.45); });
      const ports = document.createElement('div'); ports.className = 'tr-ports';
      for (const t of list) {
        if (n++ >= MAX) break;
        const p = document.createElement('div'); p.className = 'tr-mini';
        const v = this.view(t, 30, 34, 2, false, { zoom: 1.1, pitch: 0.28 });
        const hb = document.createElement('canvas'); hb.className = 'tr-minibar'; hb.width = 26; hb.height = 5; hb.style.width = '52px'; hb.style.height = '10px';
        p.append(pxCanvas(shadowBlob(22, 5, 0.45), 2, 'tr-mini-sh'), v.cv, hb);
        bars.push({ t, cv: hb });
        p.addEventListener('pointerenter', () => { v.hot(true); uiSfx('hover', 0.3); }); p.addEventListener('pointerleave', () => v.hot(false));
        p.addEventListener('click', (e) => {
          if (e.shiftKey) { this.rts.deselect(t); uiSfx('back', 0.35); return; }
          if (e.ctrlKey || e.metaKey) { this.rts.select(sel.filter((o) => o.type === t.type)); return; }
          if (e.detail >= 2) { this.rts.focus([t]); return; }
          this.rts.select([t]); uiSfx('select', 0.45);
        });
        ports.append(p);
      }
      grp.append(hd, ports);
      wrap.append(grp);
    }
    if (sel.length > MAX) { const more = document.createElement('div'); more.className = 'k7-t32 tr-more'; more.textContent = '+' + (sel.length - MAX); wrap.append(more); }
    this.body.append(wrap);
    this.live = () => { for (const b of bars) paintMini(b.cv, b.t.hp01, this.book.stateOf(b.t).morale); };
    this.live();
  }
  // ------------------------------------------------------------------ control groups
  drawGroups() {
    const G0 = this.groupsEl; G0.innerHTML = '';
    for (let i = 1; i <= 9; i++) {
      const ks = this.rts.groups.get(i); if (!ks?.length) continue;
      const tag = document.createElement('button'); tag.type = 'button'; tag.className = 'tr-gtag'; tag.dataset.g = String(i);
      skin(tag, (w, h) => strip(w, h, 'brass', 20 + i));
      const n = document.createElement('span'); n.className = 'k7-t16'; n.textContent = String(i);
      const c = document.createElement('span'); c.className = 'k7-t16 tr-gcount'; c.textContent = String(ks.length);
      tag.append(n, c);
      const on = ks.length && ks.every((k) => this.rts.sel.includes(k)) && ks.length === this.rts.sel.length;
      tag.classList.toggle('on', !!on);
      tag.addEventListener('click', (e) => { e.stopPropagation(); const m = new Map(this.book.troops.map((t) => [t.key, t])); const list = ks.map((k) => m.get(k)).filter((t): t is Troop => !!t); if (list.length) { this.rts.select(list); squash(tag, 0.6); uiSfx('select', 0.45); } });
      G0.append(tag);
    }
  }
  private tick(dt: number) {
    this.liveT += dt;
    // the panel shows only over the live colony view
    const vis = this.shown && this.rts.live();
    this.el.style.visibility = vis ? '' : 'hidden';
    if (!vis) return;
    this.acc = (this.acc ?? 0) + dt;
    if (this.acc > 0.2) { this.acc = 0; this.live?.(); this.syncKeys(); }
  }
  private acc = 0;
}

function paintBar(cv: HTMLCanvasElement, v: number, ramp: readonly number[], t: number) {
  const p = new Px(cv.width, cv.height);
  cellBar(p, 1, 1, cv.width - 2, cv.height - 2, v, ramp, t);
  p.canvas(cv);
}
function paintMini(cv: HTMLCanvasElement, hp: number, mor: number) {
  const c = cv.getContext('2d')!; c.clearRect(0, 0, cv.width, cv.height);
  const N = 5, lit = Math.ceil(hp * N - 0.01), r = hpRamp(hp);
  for (let i = 0; i < N; i++) c.drawImage(pip(r, i < lit, 3), i * 5, 0);
  void mor;
}

let css = false;
function injectCSS() {
  if (css) return; css = true;
  const s = document.createElement('style');
  s.textContent = `
.tr-ov { position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; z-index: 2 !important; pointer-events: none; image-rendering: pixelated; }
body.tr-armed canvas { cursor: crosshair; }
.h7-dock { transition: transform .34s cubic-bezier(.3,1.5,.55,1), opacity .25s; }
body.tr-cards-on .h7-dock { transform: translate(-50%, 230px); opacity: 0; transition: transform .26s cubic-bezier(.55,0,.8,.3), opacity .25s; }
body.tr-cards-on { --sub7-y: 236px; }
.tr-cards { position: fixed; left: 50%; bottom: 6px; z-index: 41; width: 940px; height: 196px; transform: translate(-50%, 240px); transition: transform .34s cubic-bezier(.55,0,.8,.3); pointer-events: none; }
.tr-cards.on { transform: translate(-50%, 0); transition: transform .42s cubic-bezier(.25,1.45,.5,1); }
.tr-cards .tr-plate { position: absolute; left: 0; right: 0; bottom: 0; height: 184px; pointer-events: auto; }
.tr-cards .tr-plate > .kp-body { display: flex; align-items: stretch; height: 100%; }
.tr-cards .tr-body { position: relative; z-index: 1; flex: 1; display: flex; align-items: center; padding: 0 8px 0 10px; min-width: 0; }
.tr-cards .tr-keys { position: relative; z-index: 1; width: 304px; display: flex; flex-direction: column; justify-content: center; gap: 0; padding-right: 2px; }
.tr-cards .tr-krow { display: flex; justify-content: center; gap: 4px; }
.tr-cards .tr-krow + .tr-krow { margin-top: -10px; }
.tr-cards .tr-key { width: 74px; }
.tr-cards .tr-key .k7-name { margin-top: -10px; }
.tr-cards .tr-key.on .k7-ic { filter: brightness(1.2) drop-shadow(0 0 6px rgba(255,200,110,.8)); transform: translateY(3px); }
.tr-one { display: flex; align-items: center; gap: 14px; height: 100%; }
.tr-port { position: relative; width: 184px; height: 168px; cursor: pointer; flex: none; margin-top: -30px; }
.tr-port canvas.k7-model { position: absolute; left: 0; top: 0; }
.tr-port .tr-port-sh { position: absolute; left: 22px; bottom: 6px; }
.tr-info { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.tr-head { display: flex; align-items: center; gap: 8px; }
.tr-head canvas { image-rendering: pixelated; }
.tr-call { color: #f6ecd0; }
.tr-sqtag { position: relative; display: inline-flex; align-items: center; height: 22px; padding: 0 12px; margin-left: 4px; }
.tr-sqtag .k7-t16 { position: relative; z-index: 1; color: #2a1c0c; text-shadow: 0 1px 0 rgba(255,240,200,.45); }
.tr-type { color: var(--k7-dim); margin-top: -6px; }
.tr-gauges, .tr-needs { display: flex; gap: 18px; align-items: center; }
.tr-g { display: flex; align-items: center; gap: 6px; }
.tr-g canvas { image-rendering: pixelated; display: block; }
.tr-needs .tr-g { gap: 4px; }
.tr-job { display: flex; align-items: center; gap: 8px; }
.tr-job canvas { image-rendering: pixelated; display: block; }
.tr-job .k7-t16 { color: #ffd98a; }
.tr-many { display: flex; flex-wrap: wrap; align-content: center; gap: 2px 18px; height: 100%; padding-top: 4px; overflow: hidden; }
.tr-grp { display: flex; flex-direction: column; align-items: flex-start; }
.tr-grp-h { display: flex; align-items: center; gap: 4px; cursor: pointer; margin-bottom: -6px; position: relative; z-index: 2; }
.tr-grp-h .k7-t16 { color: #ffe7a8; }
.tr-ports { display: flex; flex-wrap: wrap; max-width: 560px; gap: 0 2px; }
.tr-mini { position: relative; width: 60px; height: 80px; cursor: pointer; transition: transform .16s cubic-bezier(.3,1.6,.5,1); }
.tr-mini:hover { transform: translateY(-5px); }
.tr-mini canvas.k7-model { position: absolute; left: 0; top: 0; }
.tr-mini .tr-mini-sh { position: absolute; left: 8px; top: 58px; }
.tr-mini .tr-minibar { position: absolute; left: 4px; bottom: 2px; image-rendering: pixelated; }
.tr-more { align-self: center; color: #ffe7a8; }
.tr-cards .tr-roster { position: absolute !important; right: 2px; top: -30px; z-index: 3; width: 70px; }
.tr-groups { position: absolute; left: 26px; top: 0; height: 26px; display: flex; gap: 6px; pointer-events: auto; z-index: 2; }
.tr-gtag { position: relative; display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border: 0; background: none; cursor: pointer; transition: transform .14s cubic-bezier(.3,1.6,.5,1); }
.tr-gtag:hover { transform: translateY(-3px); }
.tr-gtag .k7-t16 { position: relative; z-index: 1; color: #2a1c0c; text-shadow: 0 1px 0 rgba(255,240,200,.5); }
.tr-gtag .tr-gcount { color: #5a3e18; }
.tr-gtag.on { filter: brightness(1.25) drop-shadow(0 0 5px rgba(255,210,120,.8)); }
`;
  document.head.append(s);
}
export { glyph };
