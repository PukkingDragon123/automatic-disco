// TROOPS · UNIT CARDS. When units are selected the dock sinks away and the field card rises in its place: the kit's
// standard housing (panel(): a steel machine box, its name printed on the hood plate, lamps for the selection's
// state) carrying the selection, explained in words and numbers (V7.md "MORE TEXT, MORE CONTEXT"):
//   STATUS LINE: what is selected (how many of what), their health and morale, the formation, the order running.
//   ONE UNIT: its portrait (a clone of its own live model, outlined, turning on a machined plinth), its callsign and
//   role, its current order in words (target, distance, what is queued), HEALTH and MORALE with labels, bars and
//   numbers, its needs (FOOD or CHARGE, REST, PARTS / CONDITION / SUIT O2) labelled with percentages, its weapon.
//   MANY: the portraits grouped by type, each group named with its count; hover any portrait for its card.
//   ORDER KEYS: physical keycaps (art.ts keyModel) labelled with their order and hotkey: ATTACK [A], STOP [S],
//   HOLD [H], PATROL [P]; the FORMATION row (LINE / WEDGE / COLUMN, F cycles). Each has a tooltip saying what it does.
//   HINT LINE: what the right button would do under the pointer now, and the keys to remember.
//   CONTROL GROUPS: brass tags along the top edge (GROUP 1-9 with their size); click recalls.
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
import { orderText, moraleWord, needLabels, KIND_WORD, KIND_PLURAL, typeShort, STANCE_INFO, KEY_INFO, ORDER_NAME, tname, pct, tip } from './words';

type G = Game & Record<string, any>;
const JOB_GLYPH: [RegExp, string][] = [[/ENGAG|ATTACK|ADVANC|DEFEND/, 'attack'], [/MOV|FLY|EN ROUTE|RETURN|FALL/, 'move'], [/GUARD/, 'guard'], [/PATROL/, 'patrol'], [/HOLD|STANDBY|STOP|HOVER|DOCK/, 'hold'], [/HAUL|GATHER|MIN|FORAG|SAMPL|WORK/, 'gather'], [/BUILD|CONSTR/, 'build'], [/REPAIR|WELD/, 'repair'], [/FOLLOW/, 'follow'], [/EAT|SLEEP|REFILL|CHARG|REST/, 'rest']];
export function jobGlyph(j: string) { for (const [re, g] of JOB_GLYPH) if (re.test(j)) return g; return 'hold'; }
const TYPE_GLYPH: Record<string, string> = { robot: 'gun', worker: 'claw', crew: 'suit', drone: 'scan' };

export class Cards {
  readonly el: HTMLDivElement;
  private pan: Panel;
  private body: HTMLDivElement; private keysEl: HTMLDivElement; private groupsEl: HTMLDivElement;
  private status: HTMLDivElement; private hint: HTMLDivElement;
  private views: ModelView[] = [];
  private keys = new Map<string, FloatIcon>();
  private shown = false; private key = '';
  private live: (() => void) | null = null;
  private liveT = 0;
  constructor(readonly g: G, readonly rts: Rts, readonly book: OrderBook) {
    injectCSS();
    const el = this.el = document.createElement('div'); el.className = 'trp-cards';
    // the kit's standard housing: a steel box, the selection's name on its hood plate, lamps for its state
    this.pan = panel({ tone: 'steel', seed: 41, title: 'SELECTION', head: 34, foot: 14, side: 10, well: 'none', lamps: ['green', 'amber', 'red'], hazard: true, guards: true, glands: 2, stencil: 'FIELD COMMAND', cls: 'trp-plate' });
    const inner = document.createElement('div'); inner.className = 'trp-inner'; this.pan.body.append(inner); el.append(this.pan.el);
    this.status = document.createElement('div'); this.status.className = 'k7-t16 trp-status';
    const mid = document.createElement('div'); mid.className = 'trp-mid';
    this.hint = document.createElement('div'); this.hint.className = 'k7-t16 trp-hint';
    inner.append(this.status, mid, this.hint);
    this.groupsEl = document.createElement('div'); this.groupsEl.className = 'trp-groups'; el.append(this.groupsEl);
    this.body = document.createElement('div'); this.body.className = 'trp-body'; mid.append(this.body);
    this.keysEl = document.createElement('div'); this.keysEl.className = 'trp-keys'; mid.append(this.keysEl);
    this.buildKeys();
    // the roster: the TROOPS screen from the card (the dock is down while units are selected)
    const ros = floatIcon({ build: DOCK_MODELS.troops, name: 'ROSTER', size: [30, 26], scale: 2, nameSize: 16, sound: 'open', view: { pitch: 0.5, spin: 0, yaw0: 0.5, zoom: 1.3, lift: 0.03 }, onClick: (e) => { e.stopPropagation(); void this.g.dock?.open?.('troops'); }, aria: 'TROOPS' });
    ros.el.classList.add('trp-roster'); el.append(ros.el);
    tip(ros.el, () => ({ title: 'TROOPS ROSTER', lines: ['SQUADS, STANCES AND AREAS, EVERY UNIT\'S RECORD,', 'THE ROBOT FOUNDRY AND THE LAB QUEUES.'] }));
    document.body.append(el);
    rts.onChange = () => this.refresh();
    rts.onGroups = () => this.drawGroups();
    rts.onKeyOrder = (k) => this.pressed(k);
    onFrame((dt) => { this.tick(dt); return true; });
  }
  // ------------------------------------------------------------------ the order keys
  private buildKeys() {
    const row1 = document.createElement('div'), row2 = document.createElement('div');
    row1.className = 'trp-krow'; row2.className = 'trp-krow f';
    const K = (id: string, glyphName: string, name: string, cap: Parameters<typeof keyModel>[1]['cap'], act: () => void, row: HTMLElement, big: boolean) => {
      const fi = floatIcon({ build: keyModel(glyphName, { cap }), name, size: big ? [38, 30] : [30, 24], scale: 2, nameSize: 16, sound: '', view: { pitch: 0.9, spin: 0, yaw0: 0.22, rock: 0.14, hotSpin: 0.7, zoom: 1.55, lift: 0.04 }, onClick: (e) => { e.stopPropagation(); act(); }, aria: id });
      fi.el.classList.add('trp-key'); fi.el.dataset.key = id;
      tip(fi.el, () => { const [t, l] = KEY_INFO[id] ?? [id.toUpperCase(), '']; return { title: t, lines: [l] }; });
      row.append(fi.el); this.keys.set(id, fi);
    };
    K('amove', 'attack', 'ATTACK [A]', 'red', () => this.rts.cmd('amove'), row1, true);
    K('stop', 'stop', 'STOP [S]', 'gun', () => this.rts.cmd('stop'), row1, true);
    K('hold', 'hold', 'HOLD [H]', 'olive', () => this.rts.cmd('hold'), row1, true);
    K('patrol', 'patrol', 'PATROL [P]', 'teal', () => this.rts.cmd('patrol'), row1, true);
    const fl = document.createElement('div'); fl.className = 'k7-t16 trp-flabel'; fl.textContent = 'FORMATION [F]'; row2.append(fl);
    for (const f of ['line', 'wedge', 'column'] as Formation[]) K(f, f, f.toUpperCase(), 'brass', () => this.rts.setFormation(f), row2, false);
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
    if (k === 'stop' || k === 'hold' || k === 'amove' || k === 'patrol') for (const v of this.views) v.press(0.8);
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
      document.body.classList.toggle('trp-cards-on', show);
      this.el.classList.toggle('on', show);
      uiSfx(show ? 'swishIn' : 'swishOut', 0.35, show ? 1.05 : 0.95);
    }
    if (!show) { this.clear(); return; }
    this.clear();
    if (sel.length === 1) this.one(sel[0]); else this.many(sel);
    this.pan.setTitle(sel.length === 1 ? `${this.book.stateOf(sel[0]).call} · ${sel[0].typeName}`.slice(0, 34) : `SELECTION · ${sel.length} UNITS`);
    pop(this.body, 0.25);
    this.drawGroups();
    this.syncKeys();
    this.texts();
  }
  private clear() { for (const v of this.views) v.dispose(); this.views = []; this.body.innerHTML = ''; this.live = null; }
  private view(t: Troop, w: number, h: number, scale: number, plinth: boolean, o: { spin?: number; zoom?: number; pitch?: number } = {}) {
    let v: ModelView | null = null;
    v = new ModelView(portraitBuild(t, { plinth }), { w, h, scale, spin: o.spin ?? 0, rock: 0.5, yaw0: 0.55, hotSpin: 1.6, pitch: o.pitch ?? 0.32, zoom: o.zoom ?? 1.05, shadow: [2, 2, 0.35], anim: (root) => holdLights(root, v?.yaw ?? 0) });
    this.views.push(v);
    return v;
  }
  /** a labelled gauge row: LABEL [cell bar] value */
  private gauge(label: string, icon: string, pal: string, w: number) {
    const row = document.createElement('div'); row.className = 'trp-g';
    row.append(glyphCanvas(icon, pal as never, 2));
    const l = document.createElement('span'); l.className = 'k7-t16 trp-gl'; l.textContent = label;
    const cv = document.createElement('canvas'); cv.className = 'trp-bar'; cv.width = w; cv.height = 8; cv.style.width = w * 2 + 'px'; cv.style.height = '16px';
    const v = document.createElement('span'); v.className = 'k7-t16 trp-gv';
    row.append(l, cv, v);
    return { row, cv, v };
  }
  private one(t: Troop) {
    const s = this.book.stateOf(t);
    const wrap = document.createElement('div'); wrap.className = 'trp-one';
    const port = document.createElement('div'); port.className = 'trp-port';
    const v = this.view(t, 74, 70, 2, true, { spin: 0.35, zoom: 1.0 });
    port.append(pxCanvas(shadowBlob(58, 9, 0.5), 2, 'trp-port-sh'), v.cv);
    port.addEventListener('pointerenter', () => v.hot(true)); port.addEventListener('pointerleave', () => v.hot(false));
    port.addEventListener('pointermove', (e) => v.point(e.clientX, e.clientY));
    port.addEventListener('click', () => { v.poke(10); this.rts.focus([t]); });
    tip(port, () => ({ title: 'CLICK: CENTRE THE VIEW', lines: [`${s.call} · ${t.typeName}`, `${KIND_WORD[t.kind]}`] }));
    // column 1: who, what it is doing, health and morale
    const c1 = document.createElement('div'); c1.className = 'trp-col';
    const head = document.createElement('div'); head.className = 'trp-head';
    head.append(glyphCanvas(TYPE_GLYPH[t.kind] ?? 'troops', 'brass', 2));
    const nm = document.createElement('span'); nm.className = 'k7-t32 trp-call'; nm.textContent = s.call; head.append(nm);
    const sq = this.book.squad(s.squad);
    if (sq) { const tag = document.createElement('span'); tag.className = 'trp-sqtag'; skin(tag, (w, h) => strip(w, h, 'brass', 7 + sq.id)); const tx = document.createElement('span'); tx.className = 'k7-t16'; tx.textContent = sq.name; tag.append(tx); head.append(tag); tip(tag, () => ({ title: `SQUAD ${sq.name} · ${STANCE_INFO[sq.stance][0]}`, lines: [STANCE_INFO[sq.stance][1], sq.area ? `AREA: ${Math.round(sq.area.x)}, ${Math.round(sq.area.z)} · RADIUS ${sq.area.r} M` : 'NO AREA SET (TROOPS SCREEN)'] })); }
    const ty = document.createElement('div'); ty.className = 'k7-t16 trp-type'; ty.textContent = `${t.typeName} · ${KIND_WORD[t.kind]}`;
    const job = document.createElement('div'); job.className = 'trp-job';
    const jg = document.createElement('span'); const jt = document.createElement('span'); jt.className = 'k7-t16'; job.append(jg, jt);
    const hpG = this.gauge('HEALTH', 'heart', 'red', 70), moG = this.gauge('MORALE', 'morale', 'blue', 70);
    c1.append(head, ty, job, hpG.row, moG.row);
    // column 2: the needs and the weapon
    const c2 = document.createElement('div'); c2.className = 'trp-col needs';
    const nh = document.createElement('div'); nh.className = 'k7-t16 trp-sec'; nh.textContent = 'NEEDS'; c2.append(nh);
    const n0 = t.needs(s), L = needLabels(t);
    const needIcon = { food: t.kind === 'robot' || t.kind === 'drone' ? 'battery' : 'food', rest: 'rest', maint: t.kind === 'crew' ? 'suit' : 'maint' } as const;
    const nb: Partial<Record<'food' | 'rest' | 'maint', { cv: HTMLCanvasElement; v: HTMLSpanElement }>> = {};
    for (const k of ['food', 'rest', 'maint'] as const) { if (n0[k] === null) continue; const b = this.gauge(L[k], needIcon[k], 'cream', 34); c2.append(b.row); nb[k] = b; }
    const gear = t.gear()[0];
    if (gear) { const gl = document.createElement('div'); gl.className = 'k7-t16 trp-gear'; gl.textContent = gear.val ? `${gear.name} · ${gear.val}${t.kind === 'robot' ? ' DMG' : ''}` : gear.name; c2.append(gl); }
    wrap.append(port, c1, c2);
    this.body.append(wrap);
    let lastG = '';
    this.live = () => {
      const st = this.book.stateOf(t), nd = t.needs(st);
      const maxHp = t.kind === 'crew' ? 100 : (t.ref.maxHp ?? 100);
      paintBar(hpG.cv, t.hp01, hpRamp(t.hp01), this.liveT); hpG.v.textContent = `${Math.round(t.hp01 * maxHp)} / ${Math.round(maxHp)}`;
      paintBar(moG.cv, st.morale, st.morale < 0.25 ? P.ruby : st.morale < 0.5 ? P.glowAmber : P.sapphire, this.liveT); moG.v.textContent = `${pct(st.morale)} ${moraleWord(st.morale)}`;
      for (const k of ['food', 'rest', 'maint'] as const) { const b = nb[k]; const v0 = nd[k]; if (b && v0 !== null) { paintBar(b.cv, v0, v0 < 0.25 ? P.ruby : v0 < 0.5 ? P.glowAmber : P.malachite, 0); b.v.textContent = pct(v0); } }
      const j = orderText(this.book, t);
      if (jt.textContent !== j) { jt.textContent = j; const gn = jobGlyph(j); if (gn !== lastG) { lastG = gn; jg.innerHTML = ''; jg.append(glyphCanvas(gn, 'amber', 2)); } }
    };
    this.live();
  }
  private many(sel: Troop[]) {
    const wrap = document.createElement('div'); wrap.className = 'trp-many';
    const by = new Map<string, Troop[]>();
    for (const t of sel) { const a = by.get(t.type) ?? []; a.push(t); by.set(t.type, a); }
    const groups = [...by.values()].sort((a, b) => b.length - a.length);
    const MAX = 26; let n = 0;
    const bars: { t: Troop; cv: HTMLCanvasElement }[] = [];
    for (const list of groups) {
      if (n >= MAX) break;
      const grp = document.createElement('div'); grp.className = 'trp-grp';
      const hd = document.createElement('div'); hd.className = 'trp-grp-h';
      const cnt = document.createElement('span'); cnt.className = 'k7-t16'; cnt.textContent = `${typeShort(list[0])} ×${list.length}`; hd.append(cnt);
      hd.addEventListener('click', (e) => { e.stopPropagation(); this.rts.select(list, e.shiftKey); uiSfx('select', 0.45); });
      tip(hd, () => ({ title: `${list.length} × ${list[0].typeName}`, lines: [KIND_WORD[list[0].kind], 'CLICK: SELECT ONLY THESE'] }));
      const ports = document.createElement('div'); ports.className = 'trp-ports';
      for (const t of list) {
        if (n++ >= MAX) break;
        const p = document.createElement('div'); p.className = 'trp-mini';
        const v = this.view(t, 26, 28, 2, false, { zoom: 1.12, pitch: 0.28 });
        const hb = document.createElement('canvas'); hb.className = 'trp-minibar'; hb.width = 26; hb.height = 5; hb.style.width = '52px'; hb.style.height = '10px';
        p.append(pxCanvas(shadowBlob(20, 5, 0.5), 2, 'trp-mini-sh'), v.cv, hb);
        bars.push({ t, cv: hb });
        tip(p, () => { const s = this.book.stateOf(t), maxHp = t.kind === 'crew' ? 100 : (t.ref.maxHp ?? 100), nd = t.needs(s), L = needLabels(t); const rows: [string, string | number, string?][] = [['HEALTH', `${Math.round(t.hp01 * maxHp)} / ${Math.round(maxHp)}`], ['MORALE', `${pct(s.morale)} ${moraleWord(s.morale)}`]]; for (const k of ['food', 'rest', 'maint'] as const) { const v0 = nd[k]; if (v0 !== null) rows.push([L[k], pct(v0)]); } return { title: `${s.call} · ${t.typeName}`, lines: [KIND_WORD[t.kind], 'CLICK: ONLY THIS ONE · SHIFT-CLICK: DROP IT · CTRL-CLICK: ALL OF ITS TYPE'], rows, status: ['NOW: ' + orderText(this.book, t), 'info'] }; });
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
    if (sel.length > MAX) { const more = document.createElement('div'); more.className = 'k7-t32 trp-more'; more.textContent = '+' + (sel.length - MAX); wrap.append(more); }
    this.body.append(wrap);
    this.live = () => { for (const b of bars) paintMini(b.cv, b.t.hp01); };
    this.live();
  }
  /** the status line (what is selected and how it fares) and the hint line (what the right button does here) */
  private texts() {
    const sel = this.rts.troops(); if (!sel.length) return;
    let st: string;
    if (sel.length === 1) {
      const t = sel[0], s = this.book.stateOf(t), sq = this.book.squad(s.squad);
      st = `${sq ? `SQUAD ${sq.name} (${STANCE_INFO[sq.stance][0]})` : 'NO SQUAD'} · KILLS ${s.kills} · ORDERS ${s.orders} · ${s.wounds.length ? `WOUNDS ${s.wounds.length}` : 'NO WOUNDS'}${t.canRepair ? ' · CAN REPAIR' : ''}${t.canGather ? ' · CAN GATHER' : ''}`;
    } else {
      const by: Record<string, number> = {};
      for (const t of sel) by[t.kind] = (by[t.kind] ?? 0) + 1;
      const parts = (['robot', 'worker', 'crew', 'drone'] as const).filter((k) => by[k]).map((k) => `${by[k]} ${KIND_PLURAL[k][by[k] > 1 ? 1 : 0]}`);
      const hp = sel.reduce((a, t) => a + t.hp01, 0) / sel.length, mo = sel.reduce((a, t) => a + this.book.stateOf(t).morale, 0) / sel.length;
      const ords = new Map<string, number>(); for (const t of sel) { const o = this.book.route(t)[0]; const w = o ? ORDER_NAME[o.k] : 'IDLE'; ords.set(w, (ords.get(w) ?? 0) + 1); }
      const top = [...ords.entries()].sort((a, b) => b[1] - a[1])[0];
      st = `${sel.length} SELECTED: ${parts.join(', ')} · HEALTH ${pct(hp)} · MORALE ${pct(mo)} ${moraleWord(mo)} · ${top ? (top[0] === 'IDLE' ? `${top[1]} IDLE` : `${top[1]} ON ${top[0]}`) : ''} · ${this.book.formation.toUpperCase()}`;
    }
    if (this.status.textContent !== st) this.status.textContent = st;
    const it = this.rts.intent, arm = this.rts.arm;
    const h = arm === 'amove' ? 'ATTACK-MOVE ARMED: LEFT-CLICK THE GROUND OR AN ENEMY · RIGHT-CLICK OR ESC CANCELS'
      : arm === 'patrol' ? 'PATROL ARMED: LEFT-CLICK THE FAR END OF THE ROUTE · RIGHT-CLICK OR ESC CANCELS'
      : it ? `RIGHT-CLICK: ${ORDER_NAME[it.k]}${it.tgt ? ' ' + tname(it.tgt) : it.k === 'move' ? ' HERE' : ''} · SHIFT QUEUES · RIGHT-DRAG SETS THE FACING`
      : 'RIGHT-CLICK TO ORDER · SHIFT QUEUES WAYPOINTS · DOUBLE-CLICK: ALL OF A TYPE · CTRL+1-9 MAKES A GROUP';
    if (this.hint.textContent !== h) this.hint.textContent = h;
  }
  // ------------------------------------------------------------------ control groups
  drawGroups() {
    const G0 = this.groupsEl; G0.innerHTML = '';
    for (let i = 1; i <= 9; i++) {
      const ks = this.rts.groups.get(i); if (!ks?.length) continue;
      const tag = document.createElement('button'); tag.type = 'button'; tag.className = 'trp-gtag'; tag.dataset.g = String(i);
      skin(tag, (w, h) => strip(w, h, 'brass', 20 + i));
      const n = document.createElement('span'); n.className = 'k7-t16'; n.textContent = `GROUP ${i}`;
      const c = document.createElement('span'); c.className = 'k7-t16 trp-gcount'; c.textContent = `×${ks.length}`;
      tag.append(n, c);
      const on = ks.length && ks.every((k) => this.rts.sel.includes(k)) && ks.length === this.rts.sel.length;
      tag.classList.toggle('on', !!on);
      tip(tag, () => ({ title: `CONTROL GROUP ${i} · ${ks.length} UNITS`, lines: [`PRESS ${i}: SELECT IT · PRESS ${i} TWICE: GO THERE`, `CTRL+${i}: REPLACE · SHIFT+${i}: ADD THE SELECTION`] }));
      tag.addEventListener('click', (e) => { e.stopPropagation(); const m = new Map(this.book.troops.map((t) => [t.key, t])); const list = ks.map((k) => m.get(k)).filter((t): t is Troop => !!t); if (list.length) { this.rts.select(list); squash(tag, 0.6); uiSfx('select', 0.45); } });
      G0.append(tag);
    }
  }
  private tick(dt: number) {
    this.liveT += dt;
    const vis = this.shown && this.rts.live();
    this.el.style.visibility = vis ? '' : 'hidden';
    if (!vis) return;
    this.acc += dt;
    if (this.acc > 0.2) {
      this.acc = 0; this.live?.(); this.syncKeys(); this.texts();
      const sel = this.rts.troops(), bad = sel.some((t) => t.hp01 < 0.3 || this.book.stateOf(t).morale < 0.22);
      this.pan.lamp(0, !bad); this.pan.lamp(1, !!this.rts.arm); this.pan.lamp(2, bad && Math.floor(this.liveT * 3) % 2 === 0);
    }
  }
  private acc = 0;
}

function paintBar(cv: HTMLCanvasElement, v: number, ramp: readonly number[], t: number) {
  const p = new Px(cv.width, cv.height);
  cellBar(p, 1, 1, cv.width - 2, cv.height - 2, v, ramp, t);
  p.canvas(cv);
}
function paintMini(cv: HTMLCanvasElement, hp: number) {
  const c = cv.getContext('2d')!; c.clearRect(0, 0, cv.width, cv.height);
  const N = 5, lit = Math.ceil(hp * N - 0.01), r = hpRamp(hp);
  for (let i = 0; i < N; i++) c.drawImage(pip(r, i < lit, 3), i * 5, 0);
}

let css = false;
function injectCSS() {
  if (css) return; css = true;
  const s = document.createElement('style');
  s.textContent = `
.trp-ov { position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; z-index: 2 !important; pointer-events: none; image-rendering: pixelated; }
body.trp-armed canvas { cursor: crosshair; }
.h7-dock { transition: transform .34s cubic-bezier(.3,1.5,.55,1), opacity .25s; }
body.trp-cards-on .h7-dock { transform: translate(-50%, 230px); opacity: 0; transition: transform .26s cubic-bezier(.55,0,.8,.3), opacity .25s; }
body.trp-cards-on { --sub7-y: 286px; }
.trp-cards { position: fixed; left: 522px; right: 292px; bottom: 4px; z-index: 41; height: 290px; transform: translateY(300px); transition: transform .34s cubic-bezier(.55,0,.8,.3); pointer-events: none; }
.trp-cards.on { transform: none; transition: transform .42s cubic-bezier(.25,1.45,.5,1); }
.trp-cards .trp-plate { position: absolute; left: 0; right: 0; bottom: 0; height: 262px; pointer-events: auto; }
.trp-cards .trp-plate > .kp-body { position: relative; height: 100%; }
.trp-cards .trp-inner { position: absolute; inset: 0; display: flex; flex-direction: column; }
.trp-status { height: 20px; color: #f6ecd0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding: 0 4px; }
.trp-hint { height: 20px; color: #c8bfa0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding: 0 4px; }
.trp-mid { flex: 1; display: flex; flex-direction: row; align-items: stretch; min-height: 0; }
.trp-cards .trp-body { position: relative; z-index: 1; flex: 1 1 auto; display: flex; align-items: center; padding: 0 6px 0 2px; min-width: 0; }
.trp-cards .trp-keys { position: relative; z-index: 1; flex: none; width: 372px; display: flex; flex-direction: column; justify-content: center; gap: 0; }
.trp-cards .trp-krow { display: flex; justify-content: center; align-items: flex-end; gap: 2px; }
.trp-cards .trp-krow.f { margin-top: -6px; }
.trp-cards .trp-key { width: 92px; }
.trp-cards .trp-krow.f .trp-key { width: 74px; }
.trp-cards .trp-key .k7-name { margin-top: -8px; }
.trp-cards .trp-key.on .k7-ic { filter: brightness(1.2) drop-shadow(0 0 6px rgba(255,200,110,.8)); transform: translateY(3px); }
.trp-flabel { color: #ffd98a; align-self: center; margin-right: 6px; }
.trp-one { display: flex; align-items: center; gap: 12px; height: 100%; }
.trp-port { position: relative; width: 148px; height: 140px; cursor: pointer; flex: none; }
.trp-port canvas.k7-model { position: absolute; left: 0; top: 0; }
.trp-port .trp-port-sh { position: absolute; left: 16px; bottom: 6px; }
.trp-col { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.trp-col.needs { margin-left: 10px; gap: 5px; }
.trp-head { display: flex; align-items: center; gap: 8px; }
.trp-head canvas, .trp-g canvas, .trp-job canvas { image-rendering: pixelated; display: block; }
.trp-call { color: #f6ecd0; }
.trp-sqtag { position: relative; display: inline-flex; align-items: center; height: 22px; padding: 0 12px; margin-left: 4px; }
.trp-sqtag .k7-t16 { position: relative; z-index: 1; color: #2a1c0c; text-shadow: 0 1px 0 rgba(255,240,200,.45); }
.trp-type { color: #d8ceb0; margin-top: -4px; }
.trp-g { display: flex; align-items: center; gap: 6px; }
.trp-gl { width: 74px; color: #d8ceb0; }
.trp-col.needs .trp-gl { width: 84px; }
.trp-gv { color: #f6ecd0; min-width: 52px; }
.trp-sec { color: #ffd98a; }
.trp-gear { color: #d8ceb0; margin-top: 2px; }
.trp-job { display: flex; align-items: center; gap: 6px; }
.trp-job .k7-t16 { color: #ffd98a; }
.trp-many { display: flex; flex-wrap: wrap; align-content: center; gap: 0 14px; height: 100%; width: 100%; overflow: hidden; }
.trp-grp { display: flex; flex-direction: column; align-items: flex-start; }
.trp-grp-h { display: flex; align-items: center; gap: 4px; cursor: pointer; height: 18px; position: relative; z-index: 2; }
.trp-grp-h .k7-t16 { color: #ffe7a8; }
.trp-ports { display: flex; }
.trp-mini { position: relative; width: 50px; height: 62px; cursor: pointer; transition: transform .16s cubic-bezier(.3,1.6,.5,1); }
.trp-mini:hover { transform: translateY(-5px); }
.trp-mini canvas.k7-model { position: absolute; left: -1px; top: -2px; }
.trp-mini .trp-mini-sh { position: absolute; left: 5px; top: 44px; }
.trp-mini .trp-minibar { position: absolute; left: 0; bottom: 0; image-rendering: pixelated; }
.trp-more { align-self: center; color: #ffe7a8; }
.trp-cards .trp-roster { position: absolute !important; right: 4px; top: -36px; z-index: 3; width: 90px; }
.trp-groups { position: absolute; left: 260px; top: 0; height: 26px; display: flex; gap: 6px; pointer-events: auto; z-index: 2; }
.trp-gtag { position: relative; display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border: 0; background: none; cursor: pointer; transition: transform .14s cubic-bezier(.3,1.6,.5,1); }
.trp-gtag:hover { transform: translateY(-3px); }
.trp-gtag .k7-t16 { position: relative; z-index: 1; color: #2a1c0c; text-shadow: 0 1px 0 rgba(255,240,200,.5); }
.trp-gtag .trp-gcount { color: #5a3e18; }
.trp-gtag.on { filter: brightness(1.25) drop-shadow(0 0 5px rgba(255,210,120,.8)); }
`;
  document.head.append(s);
}
export { glyph };
