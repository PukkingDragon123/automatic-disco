// MASTERY: the selected engineering path as a living diorama (src/research/ui/dioramas.ts) that grows as it is
// mastered; its twelve perks are parts of the thing (buds, junctions, machine parts, gene vials, robot parts), each
// marked with an engraved brass tag on a straight steel pointer. Machined keys on the left pick the path; the plate
// on the right reads the hovered or selected perk, or the path itself, and installs it.
import { el } from './kit';
import { sfx } from '../audio/audio';
import { csfx } from './cineAudio';
import { PATHS, PATH, SUBS, SUB, PERKS, PERK, TIER_LV, FOCUS_LV, MAX_LV, type PathId, type Perk, type Mastery } from '../research/mastery';
import { iconURL } from '../research/ui/icons';
import { Diorama, type NodeState } from '../research/ui/dioramas';
import { Callouts } from '../research/ui/callouts';
import type { TabPage } from './skillTree';

const ROMAN = ['', 'I', 'II', 'III', 'IV'];
export type { TabPage };

export class MasteryPage implements TabPage {
  readonly el: HTMLElement;
  vig: Diorama;
  path: PathId;
  private paths: HTMLElement; private card: HTMLElement; private stage: HTMLElement; private calls: Callouts;
  private tags = new Map<string, HTMLElement>();
  private hover: string | null = null; private sel: string | null = null; private sig = '';
  constructor(readonly M: Mastery, path?: PathId, private onChange?: () => void) {
    this.path = path ?? PATHS.reduce((b, p) => (M.points(p) > M.points(b) ? p : b), 'plant' as PathId);
    this.el = el('div', '');
    this.stage = el('div', 'pp-stage', this.el);
    this.vig = new Diorama(this.path, M);
    this.vig.bind(this.stage);
    this.calls = new Callouts(this.el, this.vig);
    this.paths = el('div', 'pp-paths', this.el);
    this.card = el('div', 'pp-card pp-col', this.el);
    this.card.style.cssText = 'right:28px;top:104px;width:450px;max-height:calc(100vh - 140px)';
    this.build();
  }
  private st(p: Perk): NodeState {
    const M = this.M;
    if (M.perks().includes(p.id)) return 'owned';
    const f = M.focus(p.path);
    if (p.tier >= 3 && f && f !== p.sub) return 'barred';
    if (M.level(p.path) < TIER_LV[p.tier]) return 'locked';
    return M.why(p.id) ? 'short' : 'ready';
  }
  setPath(p: PathId) {
    if (p === this.path) return;
    this.path = p; this.sel = this.hover = null; csfx('page', 0.5);
    const old = this.vig; this.vig = new Diorama(p, this.M); this.vig.resize(innerWidth, innerHeight); this.vig.yaw = old.yaw;
    old.dispose();
    this.calls.vig = this.vig;
    this.vig.bind(this.stage);
    this.sig = ''; this.build();
  }
  private take(id: string) {
    if (this.M.why(id)) { sfx('deny'); return; }
    this.M.take(id); csfx('thud', 0.9, 0.9); sfx('done', 0.8, 0.6);
    this.sel = id; this.sig = ''; this.build(); this.onChange?.();
  }
  key(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    if (k === 'q' || k === 'e' || k === 'arrowup' || k === 'arrowdown') { const i = PATHS.indexOf(this.path), d = k === 'q' || k === 'arrowup' ? -1 : 1; this.setPath(PATHS[(i + d + PATHS.length) % PATHS.length]); return true; }
    if (k === 'enter' && this.sel) { this.take(this.sel); return true; }
    return false;
  }
  private signature() { const M = this.M; return [this.path, ...PATHS.map((p) => Math.floor(M.xp(p)) + ':' + M.points(p) + ':' + (M.focus(p) ?? '')), M.perks().join(',')].join('|'); }
  update() {
    const s = this.signature(); if (s !== this.sig) { this.sig = s; this.build(); }
    this.calls.update();
  }

  // ---------------------------------------------------------------- the paper
  private build() {
    const M = this.M;
    this.vig.setStates((id) => this.st(PERK[id]));
    // the path tabs
    this.paths.innerHTML = '';
    for (const p of PATHS) {
      const d = PATH[p], lv = M.level(p), pts = M.points(p), f = M.focus(p);
      const c = el('div', 'pp-path' + (p === this.path ? ' on' : ''), this.paths);
      const img = el('img', '', c); img.src = iconURL(d.icon, 'phos');
      el('div', 'nm', c, d.short);
      el('div', 'lv', c, `${lv}`);
      el('div', 'sub', c, `${f ? SUB[f].name : lv >= FOCUS_LV ? 'CHOOSE A FOCUS' : 'LEVEL ' + lv + ' OF ' + MAX_LV}${pts > 0 ? ` · ${pts} PT` : ''}`);
      c.addEventListener('click', () => this.setPath(p));
    }
    // the callouts: one paper tag per perk, pinned to its part of the diorama
    this.calls.clear(); this.tags.clear();
    const subs = SUBS.filter((s) => s.path === this.path);
    for (const n of this.vig.nodes) {
      const p = PERK[n.id], st = this.st(p), i = subs.findIndex((s) => s.id === p.sub);
      const t = el('div', `pp-call ${st}${this.sel === p.id ? ' sel' : ''}`, this.el);
      const im = el('img', '', t); im.src = iconURL(p.icon, st === 'locked' || st === 'barred' ? 'dim' : 'phos');
      el('div', 'nm', t, p.name); el('i', 'st', t);
      t.addEventListener('pointerenter', () => { this.hover = p.id; this.drawCard(); sfx('click', 1.6, 0.08); });
      t.addEventListener('pointerleave', () => { if (this.hover === p.id) { this.hover = null; this.drawCard(); } });
      t.addEventListener('click', () => { if (this.sel === p.id && !M.why(p.id)) { this.take(p.id); return; } this.sel = p.id; for (const [k, e] of this.tags) e.classList.toggle('sel', k === p.id); this.drawCard(); sfx('click'); });
      const dx = i === 0 ? -96 : i === 2 ? 96 : (p.tier % 2 ? -88 : 88), dy = -8;
      this.calls.add(t, n.anchor, dx, dy);
      this.tags.set(p.id, t);
    }
    this.drawCard();
  }
  private drawCard() {
    const M = this.M, c = this.card, d = PATH[this.path], id = this.hover ?? this.sel, p = id ? PERK[id] : null;
    c.innerHTML = '';
    const head = el('div', 'pp-row', c);
    const hl = el('div', 'pp-col', head); hl.style.flex = '1';
    el('div', 'pp-hl', hl, d.name);
    el('div', 'pp-t pp-dim', hl, d.motto);
    const lv = M.level(this.path);
    el('div', 'pp-stamp', head, `LV ${lv}`);
    const bar = el('div', 'pp-bar', c); el('i', '', bar).style.width = `calc(${(lv >= MAX_LV ? 1 : M.frac(this.path)) * 100}% - 4px)`;
    const pts = M.points(this.path);
    el('div', 'pp-s', c, pts > 0 ? `${pts} MASTERY POINT${pts > 1 ? 'S' : ''} TO SPEND` : `NEXT POINT AT LEVEL ${Math.min(MAX_LV, lv + 1)}`);
    el('div', 'pp-rule', c);
    if (M.canFocus(this.path)) {
      el('div', 'pp-h pp-red', c, 'CHOOSE A FOCUS');
      el('div', 'pp-t', c, 'The other two lose tiers III and IV for good.');
      const row = el('div', 'pp-col', c);
      for (const s of SUBS.filter((q) => q.path === this.path)) {
        const k = el('div', 'pp-key', row, `<img src="${iconURL(s.icon, 'phos')}">${s.name}`);
        k.addEventListener('click', () => { if (M.setFocus(this.path, s.id)) { csfx('thud', 1, 0.8); sfx('done'); this.sig = ''; this.build(); this.onChange?.(); } });
      }
      el('div', 'pp-rule', c);
    }
    if (!p) {
      el('div', 'pp-h', c, 'LEARNED BY DOING');
      for (const l of d.earn) el('div', 'pp-t pp-plus', c, l);
      const f = M.focus(this.path);
      if (f) { el('div', 'pp-rule', c); el('div', 'pp-t', c, `Focus: <b>${SUB[f].name}</b>. 15% faster on this path.`); }
      const lg = M.log.filter((l) => l.path === this.path).slice(0, 4);
      if (lg.length) { el('div', 'pp-rule', c); for (const l of lg) el('div', 'pp-t pp-dim', c, `+${Math.round(l.n)} ${l.why || 'work'}`); }
      return;
    }
    const st = this.st(p);
    const ph = el('div', 'pp-row', c);
    const im = el('img', 'pp-ico', ph); im.src = iconURL(p.icon, st === 'locked' || st === 'barred' ? 'dim' : 'phos'); im.style.cssText = 'width:96px;height:96px';
    const pt = el('div', 'pp-col', ph); el('div', 'pp-hl', pt, p.name); el('div', 'pp-s', pt, `TIER ${ROMAN[p.tier]} · ${SUB[p.sub].name}${p.tier === 4 ? ' · CAPSTONE' : ''}`);
    const pips = el('div', '', pt); for (let k = 0; k < p.cost; k++) el('i', 'pp-pip' + (st === 'owned' ? ' on' : ''), pips);
    el('div', 'pp-t', c, p.desc);
    for (const l of p.plus) el('div', 'pp-t pp-plus', c, l);
    for (const l of p.minus ?? []) el('div', 'pp-t pp-minus', c, l);
    const why = M.why(p.id);
    if (st === 'owned') el('div', 'pp-stamp', c, 'INSTALLED');
    else {
      if (why) el('div', 'pp-t pp-red', c, why);
      const k = el('div', 'pp-key' + (why ? ' dead' : ' hot'), c, 'INSTALL  ENTER'); k.style.alignSelf = 'flex-start';
      k.addEventListener('click', () => this.take(p.id));
    }
  }
  dispose() { this.calls.clear(); this.vig.dispose(); this.el.remove(); }
}
