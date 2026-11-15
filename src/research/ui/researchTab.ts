// RESEARCH: the latest specimen turning under the scanner dome (ScannerVignette), tagged with what its scan paid;
// the data reserves as paper tags on the left with the scan log; the tech index on the right as a stack of cards by
// kind (icons first, words sparse), the selected tech's card, and the station queue pinned under it.
import { el } from '../../ui/kit';
import { sfx } from '../../audio/audio';
import { csfx } from '../../ui/cineAudio';
import { TECHS, TECH, TECH_KINDS, DATA_KINDS, DATA_NAME, type TechKind, type Tech, type DataKind } from '../tech';
import { PATH } from '../mastery';
import type { Research } from '../research';
import { BLUEPRINT } from '../upgrades';
import { iconURL } from './icons';
import { fmtTime } from '../util';
import { ScannerVignette, type SpecimenKind } from './vignettes';
import { Callouts } from './callouts';
import type { TabPage } from '../../ui/skillTree';

const DATA_ICON: Record<DataKind, string> = { bio: 'dna', geo: 'pick', energy: 'arcs', xeno: 'sensor' };
export const chips = (cost: Tech['cost'], data?: Record<DataKind, number>) => DATA_KINDS.filter((k) => cost[k]).map((k) => `<span class="pp-row" style="gap:2px"><img class="pp-ico" src="${iconURL(DATA_ICON[k], data && data[k] < (cost[k] ?? 0) ? 'dim' : 'phos')}" style="width:24px;height:24px"><span class="pp-t${data && data[k] < (cost[k] ?? 0) ? ' pp-red' : ''}">${cost[k]}</span></span>`).join('');

export class ResearchPage implements TabPage {
  readonly el: HTMLElement;
  readonly vig = new ScannerVignette();
  private kind: TechKind = 'building'; private sel: string | null = null;
  private left: HTMLElement; private right: HTMLElement; private calls: Callouts; private specTag: HTMLElement; private headTag: HTMLElement;
  private sig = ''; private specKey = '';
  constructor(readonly R: Research, readonly host: Record<string, any>) {
    this.el = el('div', '');
    const stage = el('div', 'pp-stage', this.el); this.vig.bind(stage);
    this.vig.margins = [380, 500];
    this.calls = new Callouts(this.el, this.vig);
    this.left = el('div', 'pp-col', this.el); this.left.style.cssText = 'position:absolute;left:24px;top:100px;width:330px;gap:10px';
    this.right = el('div', 'pp-card pp-col', this.el); this.right.style.cssText = 'right:28px;top:104px;width:480px;height:calc(100vh - 140px)';
    this.specTag = el('div', 'pp-call', this.el); this.headTag = el('div', 'pp-call', this.el);
    this.calls.add(this.specTag, this.vig.anchors.spec, -230, -60);
    this.calls.add(this.headTag, this.vig.anchors.head, 150, -40);
    const first = TECHS.find((q) => !R.unlocked(q.id) && !R.why(q.id));
    if (first) { this.kind = first.kind; this.sel = first.id; }
    this.build();
  }
  private state(t: Tech): 'known' | 'active' | 'queued' | 'ready' | 'locked' {
    const R = this.R;
    if (R.unlocked(t.id)) return 'known';
    if (R.queue[0] === t.id) return 'active';
    if (R.queue.includes(t.id)) return 'queued';
    return R.why(t.id) ? 'locked' : 'ready';
  }
  private signature() { const R = this.R; return [this.kind, this.sel, R.queue.join(','), R.known().length, DATA_KINDS.map((k) => Math.floor(R.data[k])).join(','), R.log.length, R.stations().powered, Math.floor(R.headFrac() * 40)].join('|'); }
  update() { const s = this.signature(); if (s !== this.sig) { this.sig = s; this.build(); } this.calls.update(); }
  key(e: KeyboardEvent) {
    if (e.key === 'Enter' && this.sel) { this.queue(this.sel); return true; }
    const i = TECH_KINDS.findIndex((k) => k.k === this.kind);
    if (e.key.toLowerCase() === 'q' || e.key.toLowerCase() === 'e') { this.kind = TECH_KINDS[(i + (e.key.toLowerCase() === 'q' ? -1 : 1) + TECH_KINDS.length) % TECH_KINDS.length].k; this.sig = ''; csfx('page', 0.4); return true; }
    return false;
  }
  private queue(id: string) {
    const R = this.R;
    if (R.queue.includes(id)) { if (R.queue[0] !== id) { R.bump(id); csfx('page', 0.5); } return; }
    if (R.enqueue(id)) { csfx('thud', 0.7, 1.1); sfx('click'); } else sfx('deny');
    this.sig = '';
  }
  /** the newest scan goes under the dome */
  private specimen() {
    const e = this.R.log[0], key = e ? e.name + e.t : 'none';
    if (key === this.specKey) return; this.specKey = key;
    const sp = e?.kind === 'species' ? (this.host.run?.reg?.list ?? []).find((s: any) => s.name === e.name) : null;
    void this.vig.show((e?.kind ?? 'none') as SpecimenKind, e?.name ?? '', sp);
  }
  private build() {
    const R = this.R;
    this.specimen();
    const e = R.log[0];
    this.specTag.innerHTML = e ? `<div class="pp-col" style="gap:0"><span class="pp-h">${e.name}</span><span class="pp-t">${DATA_KINDS.filter((k) => e.data[k]).map((k) => `+${e.data[k]} ${DATA_NAME[k]}`).join('  ')}</span></div>` : '<span class="pp-t">Nothing scanned yet</span>';
    const s = R.stations();
    this.headTag.innerHTML = `<img src="${iconURL('lens', s.powered ? 'phos' : 'dim')}"><span class="pp-t">${s.n ? `${s.powered}/${s.n} STATIONS · ${R.rate().toFixed(1)}x` : 'NO STATION'}</span>`;
    // ---------------- left: reserves and the scan log
    const L = this.left; L.innerHTML = '';
    for (const k of DATA_KINDS) {
      const t = el('div', 'pp-tag', L); t.style.justifyContent = 'space-between';
      el('div', 'pp-row', t, `<img class="pp-ico" src="${iconURL(DATA_ICON[k], R.data[k] > 0 ? 'phos' : 'dim')}" style="width:48px;height:48px;margin:-10px 0"><span class="pp-h">${DATA_NAME[k]}</span>`);
      el('div', 'pp-hx', t, String(Math.floor(R.data[k])));
    }
    const lg = el('div', 'pp-note pp-col', L); lg.style.position = 'relative'; lg.style.gap = '2px';
    el('div', 'pp-h', lg, 'SCAN LOG');
    if (!R.log.length) el('div', 'pp-t pp-dim', lg, 'Scan species, plants, ore, vents and ruins.');
    for (const x of R.log.slice(1, 8)) el('div', 'pp-t', lg, `${x.name.length > 18 ? x.name.slice(0, 17) + '.' : x.name}`);
    // ---------------- right: the tech index
    const Rt = this.right; Rt.innerHTML = '';
    const kinds = el('div', 'pp-row', Rt); kinds.style.flexWrap = 'wrap';
    for (const k of TECH_KINDS) {
      const b = el('div', 'pp-tab' + (k.k === this.kind ? ' on' : ''), kinds, `<span class="pp-s" style="color:inherit">${k.name}</span>`); b.style.minHeight = '40px'; b.style.marginTop = '0';
      b.addEventListener('click', () => { this.kind = k.k; this.sig = ''; csfx('page', 0.4); });
    }
    const list = el('div', 'pp-list pp-col', Rt); list.style.cssText = 'flex:1;min-height:0;gap:2px';
    const order = { active: 0, queued: 1, ready: 2, locked: 3, known: 4 };
    for (const t of TECHS.filter((q) => q.kind === this.kind && !q.start).sort((a, b) => order[this.state(a)] - order[this.state(b)])) {
      const st = this.state(t);
      const row = el('div', 'pp-row', list); row.style.cssText = `cursor:pointer;padding:2px 4px;${this.sel === t.id ? 'background:rgba(217,164,58,0.35)' : ''}`;
      el('img', 'pp-ico', row).setAttribute('src', iconURL(t.icon, st === 'locked' ? 'dim' : 'phos')); (row.lastChild as HTMLElement).style.cssText = 'width:48px;height:48px';
      const mid = el('div', 'pp-col', row); mid.style.cssText = 'flex:1;gap:0';
      el('div', 'pp-h' + (st === 'locked' ? ' pp-dim' : ''), mid, t.name);
      el('div', 'pp-row', mid, st === 'known' ? '<span class="pp-s pp-grn">KNOWN</span>' : st === 'active' ? `<span class="pp-s pp-amb">RESEARCHING ${Math.round(R.headFrac() * 100)}%</span>` : st === 'queued' ? `<span class="pp-s pp-amb">QUEUED ${R.queue.indexOf(t.id) + 1}</span>` : chips(t.cost, R.data));
      row.addEventListener('click', () => { if (this.sel === t.id && st !== 'known' && st !== 'locked') this.queue(t.id); else { this.sel = t.id; sfx('click'); } this.sig = ''; });
    }
    el('div', 'pp-rule', Rt);
    const t = this.sel ? TECH[this.sel] : null;
    if (t) {
      const st = this.state(t);
      el('div', 'pp-row', Rt, `<img class="pp-ico" src="${iconURL(t.icon, 'phos')}" style="width:96px;height:96px"><div class="pp-col"><span class="pp-hl">${t.name}</span><span class="pp-s">${PATH[t.path].short} · ${fmtTime(t.time)} AT ONE STATION</span></div>`);
      el('div', 'pp-t', Rt, t.blueprint ? `${t.desc} Built at the Upgrader: ${BLUEPRINT[t.blueprint]?.name}.` : t.desc);
      const why = R.why(t.id), short = R.short(t.id);
      if (st !== 'known' && why) el('div', 'pp-t pp-red', Rt, (R.requirementOf(t.id) ?? why).toLowerCase().replace(/^\w/, (m) => m.toUpperCase()));
      else if (st !== 'known' && short) el('div', 'pp-t pp-amb', Rt, `Waiting on ${short}`);
      const k = el('div', 'pp-key' + (st === 'known' || why || st === 'active' ? ' dead' : ' hot'), Rt, st === 'known' ? 'KNOWN' : st === 'active' ? 'RESEARCHING' : st === 'queued' ? 'TO THE FRONT' : 'QUEUE  ENTER'); k.style.alignSelf = 'flex-start';
      k.addEventListener('click', () => { if (st !== 'known' && !why) this.queue(t.id); });
    }
    if (R.queue.length) {
      const q = el('div', 'pp-row', Rt); q.style.flexWrap = 'wrap';
      el('span', 'pp-s', q, 'QUEUE');
      R.queue.slice(0, 5).forEach((id, i) => { const im = el('img', 'pp-ico', q); im.src = iconURL(TECH[id].icon, 'phos'); im.style.cssText = `width:48px;height:48px;${i === 0 ? 'outline:3px solid #d9a43a' : ''}`; im.title = TECH[id].name; im.addEventListener('click', () => { R.dequeue(id); this.sig = ''; }); });
      const stall = R.stalled(); if (stall) el('span', 'pp-s pp-red', q, stall);
    }
  }
  dispose() { this.calls.clear(); this.vig.dispose(); this.el.remove(); }
}
