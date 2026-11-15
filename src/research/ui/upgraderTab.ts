// UPGRADER: the Upgrader (its lowpix model) beside the pod, the selected blueprint's part hanging from the hoist and
// lowering as the gantry builds it. Paper tags on the pod show what is fitted where; the blueprint index is a card on
// the left; the build card on the right lists the real parts from the stores (have / need) and BUILD AND INSTALL.
import { el } from '../../ui/kit';
import { sfx } from '../../audio/audio';
import { csfx } from '../../ui/cineAudio';
import { BLUEPRINTS, BLUEPRINT, TARGET_NAME, costOf, type Upgrades, type Target } from '../upgrades';
import { upState } from '../buildings';
import { itemIcon } from '../../factory/items';
import { have, itemName, fmtTime } from '../util';
import { iconURL } from './icons';
import { TECHS } from '../tech';
import { BenchVignette } from './vignettes';
import { Callouts } from './callouts';
import type { TabPage } from '../../ui/skillTree';
import type { Game } from '../../game/game';

const TARGETS: Target[] = ['pod', 'arm', 'tool', 'drone'];
const ANCHOR: Record<Target, string> = { pod: 'core', arm: 'arm', tool: 'tool', drone: 'drone' };

export class UpgraderPage implements TabPage {
  readonly el: HTMLElement;
  readonly vig = new BenchVignette();
  private sel: string | null = null;
  private left: HTMLElement; private right: HTMLElement; private calls: Callouts;
  private slotTags = new Map<Target, HTMLElement>(); private gantryTag: HTMLElement;
  private sig = ''; private doneT = -9; private doneId = ''; private off: () => void; private t = 0;
  constructor(readonly U: Upgrades, readonly g: Game, readonly research: { unlocked(id: string): boolean } | null) {
    this.el = el('div', '');
    const stage = el('div', 'pp-stage', this.el); this.vig.bind(stage);
    this.calls = new Callouts(this.el, this.vig);
    this.left = el('div', 'pp-metal pp-col', this.el); this.left.style.cssText = 'left:28px;top:104px;width:360px;height:calc(100vh - 140px)';
    this.right = el('div', 'pp-metal pp-col', this.el); this.right.style.cssText = 'right:28px;top:104px;width:450px;max-height:calc(100vh - 140px)';
    for (const tg of TARGETS) { const t = el('div', 'pp-call', this.el); this.slotTags.set(tg, t); this.calls.add(t, this.vig.anchors[ANCHOR[tg]], tg === 'arm' ? 120 : tg === 'pod' ? 40 : tg === 'tool' ? -40 : 90, tg === 'pod' ? -110 : tg === 'drone' ? 110 : tg === 'tool' ? 120 : 175); }
    this.gantryTag = el('div', 'pp-call', this.el); this.calls.add(this.gantryTag, this.vig.anchors.gantry, -60, -70);
    this.vig.margins = [400, 480];
    this.sel = BLUEPRINTS.find((b) => this.known(b.id) && this.U.count(b.id) < b.max)?.id ?? BLUEPRINTS.find((b) => this.known(b.id))?.id ?? null;
    this.off = U.on('install', (d) => { this.doneT = this.t; this.doneId = d.id; csfx('thud', 1, 0.8); this.sig = ''; });
    this.build();
  }
  private known(id: string) { return this.research ? this.research.unlocked(id) : true; }
  private machines(): any[] { const bs = ((this.g as any)?.factory?.buildings ?? []).filter((b: any) => b.kind === 'upgrader' && !b.dead); return bs.sort((a: any, b: any) => (upState(a).job ? 1 : 0) - (upState(b).job ? 1 : 0)); }
  private signature() { const m = this.machines(); return [this.sel, this.U.list().map((u) => u.id + u.n).join(','), m.length, m.map((b) => (upState(b).job ? upState(b).job!.id + Math.floor((upState(b).job!.t / upState(b).job!.time) * 30) : '-') + b.status).join(','), this.sel ? this.U.missing(this.sel).map((x) => x[1]).join(',') : ''].join('|'); }
  update(dt: number) {
    this.t += dt;
    const s = this.signature(); if (s !== this.sig) { this.sig = s; this.build(); }
    const busy = this.machines().find((b) => upState(b).job);
    this.vig.progress = busy ? upState(busy).job!.t / upState(busy).job!.time : -1;
    this.calls.update();
  }
  key(e: KeyboardEvent) { if (e.key === 'Enter' && this.sel) { this.start(); return true; } return false; }
  private start() {
    const id = this.sel; if (!id) return;
    const m = this.machines()[0]; if (!m) { sfx('deny'); return; }
    if (!this.U.start(upState(m), id)) { sfx('deny'); return; }
    csfx('lever', 0.8); csfx('servo', 0.7, 1); sfx('click'); this.sig = '';
  }
  private build() {
    const U = this.U, ms = this.machines(), busy = ms.find((b) => upState(b).job);
    const sel = this.sel ? BLUEPRINT[this.sel] : null;
    this.vig.setPart(busy ? BLUEPRINT[upState(busy).job!.id].icon : sel?.icon ?? 'gear', !!busy);
    // tags on the pod: what is fitted to each target
    for (const tg of TARGETS) {
      const fit = BLUEPRINTS.filter((b) => b.target === tg && U.has(b.id));
      this.slotTags.get(tg)!.innerHTML = `<span class="pp-s" style="padding:0 4px">${TARGET_NAME[tg]}</span>${fit.map((b) => `<img src="${iconURL(b.icon, 'phos')}" title="${b.name}">`).join('') || '<span class="pp-t pp-dim">EMPTY</span>'}`;
    }
    this.gantryTag.innerHTML = busy ? `<img src="${iconURL(BLUEPRINT[upState(busy).job!.id].icon, 'phos')}"><span class="pp-t">${Math.round((upState(busy).job!.t / upState(busy).job!.time) * 100)}% · ${fmtTime(upState(busy).job!.time - upState(busy).job!.t)}</span>` : `<span class="pp-t">${ms.length ? 'GANTRY IDLE' : 'NO UPGRADER BUILT'}</span>`;
    // the blueprint index
    const L = this.left; L.innerHTML = '';
    el('div', 'pp-hl', L, 'BLUEPRINTS');
    const list = el('div', 'pp-list pp-col', L); list.style.cssText = 'flex:1;min-height:0;gap:0';
    for (const tg of TARGETS) {
      el('div', 'pp-s', list, TARGET_NAME[tg]).style.marginTop = '6px';
      for (const b of BLUEPRINTS.filter((q) => q.target === tg)) {
        const k = this.known(b.id), n = U.count(b.id);
        const row = el('div', 'pp-row', list); row.style.cssText = `cursor:pointer;padding:0 4px;${this.sel === b.id ? 'background:rgba(217,164,58,0.35)' : ''}`;
        el('img', 'pp-ico', row).setAttribute('src', iconURL(b.icon, k ? 'phos' : 'dim')); (row.lastChild as HTMLElement).style.cssText = 'width:48px;height:48px';
        el('div', 'pp-h' + (k ? '' : ' pp-dim'), row, b.name).style.flex = '1';
        if (n) el('span', 'pp-s pp-grn', row, b.max > 1 ? `${n}/${b.max}` : 'FITTED');
        row.addEventListener('click', () => { this.sel = b.id; sfx('click'); this.sig = ''; });
      }
    }
    // the build card
    const R = this.right; R.innerHTML = '';
    if (!sel) return;
    const k = this.known(sel.id), n = U.count(sel.id);
    el('div', 'pp-row', R, `<img class="pp-ico" src="${iconURL(sel.icon, k ? 'phos' : 'dim')}" style="width:96px;height:96px"><div class="pp-col"><span class="pp-hl">${sel.name}</span><span class="pp-s">${TARGET_NAME[sel.target]} · ${fmtTime(sel.time)} ON THE GANTRY</span></div>`);
    el('div', 'pp-t', R, sel.desc);
    el('div', 'pp-t pp-plus', R, sel.effect);
    el('div', 'pp-rule', R);
    const cost = costOf(sel.id);
    for (const id in cost) {
      const h = have(this.g, id), row = el('div', 'pp-row', R);
      const im = el('img', 'pp-ico', row); try { im.src = itemIcon(id); } catch { /* icon */ } im.style.cssText = 'width:32px;height:32px';
      el('span', 'pp-t', row, itemName(id)).style.flex = '1';
      el('span', 'pp-h' + (h < cost[id] ? ' pp-red' : ''), row, `${Math.min(h, 9999)}/${cost[id]}`);
    }
    el('div', 'pp-rule', R);
    const why = U.why(sel.id, ms[0] ? upState(ms[0]) : null) ?? (ms.length ? null : 'No Upgrader built');
    if (this.doneId === sel.id && this.t - this.doneT < 6) el('div', 'pp-stamp', R, 'INSTALLED');
    else if (n >= sel.max) el('div', 'pp-stamp', R, 'FITTED');
    else {
      if (!k) { const t = TECHS.find((q) => q.blueprint === sel.id); el('div', 'pp-t pp-red', R, t ? `Research ${t.name} first.` : 'Not researched.'); }
      else if (why) el('div', 'pp-t pp-red', R, why);
      const key = el('div', 'pp-key' + (why || !k ? ' dead' : ' hot'), R, 'BUILD AND INSTALL'); key.style.alignSelf = 'flex-start';
      key.addEventListener('click', () => this.start());
    }
    if (busy) { const bar = el('div', 'pp-bar amb', R); el('i', '', bar).style.width = `calc(${(upState(busy).job!.t / upState(busy).job!.time) * 100}% - 4px)`; if (busy.status === 'nopower') el('div', 'pp-t pp-red', R, 'No power: the gantry has stopped.'); }
  }
  dispose() { this.off(); this.calls.clear(); this.vig.dispose(); this.el.remove(); }
}
